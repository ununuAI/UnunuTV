import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { handleUnuTvRequest } from "@ununu/unutv-api";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

const applicationDirectory = path.dirname(fileURLToPath(import.meta.url));
const QUICK_TUNNEL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

async function waitForProviderMediaTunnel(publicUrl, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const deadline = Date.now() + (options.timeoutMs || 60_000);
  const probeUrl = new URL("/provider-media/__tunnel_probe__/__tunnel_probe__", `${publicUrl}/`);
  probeUrl.searchParams.set("expires", "0");
  probeUrl.searchParams.set("signature", "probe");
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(probeUrl, { signal: AbortSignal.timeout(3_000) });
      const payload = await response.text();
      if (response.status === 400 && payload.includes("invalid_project_id")) return;
      lastError = new Error(`unexpected tunnel probe response: ${response.status} ${payload.slice(0, 160)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Public media tunnel did not become reachable: ${lastError?.message || "timeout"}`);
}

function launchProviderMediaTunnel({ port, runtime, spawnImpl = spawn, fetchImpl }) {
  return new Promise((resolve, reject) => {
    const tunnel = spawnImpl("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let completed = false;
    let probing = false;
    let output = "";
    const fail = (error) => {
      if (completed) return;
      completed = true;
      tunnel.kill?.("SIGTERM");
      reject(error);
    };
    const inspect = async (chunk) => {
      const text = chunk.toString("utf8");
      output = `${output}${text}`.slice(-16_384);
      for (const line of text.split("\n")) {
        if (line && !line.includes("trycloudflare.com")) console.error(`[tunnel] ${line}`);
      }
      const match = output.match(QUICK_TUNNEL_PATTERN);
      if (!match || probing || completed) return;
      probing = true;
      console.log(`Provider media tunnel discovered: ${match[0]}; checking reachability...`);
      try {
        await waitForProviderMediaTunnel(match[0], { fetchImpl });
        if (completed) return;
        completed = true;
        runtime.publisher.setPublicBaseUrl(match[0]);
        console.log(`Signed provider media tunnel: ${match[0]}`);
        console.log("Public tunnel exposes only expiring /provider-media/ URLs; project API and UI remain loopback-only.");
        resolve(tunnel);
      } catch (error) {
        fail(error);
      }
    };
    tunnel.stdout.on("data", inspect);
    tunnel.stderr.on("data", inspect);
    tunnel.once("error", (error) => fail(new Error(`Unable to start cloudflared: ${error.message}`)));
    tunnel.once("exit", (code) => fail(new Error(`cloudflared exited before the tunnel was ready (code ${code ?? "unknown"})`)));
  });
}

function isLoopbackRequest(request) {
  const hostname = String(request.headers.host || "").split(":", 1)[0].replace(/^\[|\]$/g, "").toLowerCase();
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

export async function createUnuTvWebServer(options = {}) {
  const dev = options.dev ?? process.env.UNUTV_WEB_DEV === "1";
  const host = options.host || "127.0.0.1";
  const port = Number(options.port || process.env.UNUTV_PORT || 4318);
  const publicTunnel = options.publicTunnel === true;
  const publisher = publicTunnel
    ? { ...(options.publisher || {}), publicBaseUrl: "" }
    : options.publisher;
  const runtime = createLocalRuntime({ dataRoot: options.dataRoot, provider: options.provider, publisher });
  const web = next({ dev, dir: applicationDirectory, hostname: host, port });
  await web.prepare();
  const handleWeb = web.getRequestHandler();
  const server = http.createServer((request, response) => {
    if (request.url.startsWith("/provider-media/")) {
      return handleUnuTvRequest(request, response, runtime);
    }
    if (!isLoopbackRequest(request)) {
      response.writeHead(403, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: { code: "local_surface_only", message: "Only signed provider media is public" } }));
      return;
    }
    if (request.url.startsWith("/api/")) return handleUnuTvRequest(request, response, runtime);
    return handleWeb(request, response);
  });
  let tunnel;
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    if (publicTunnel) runtime.publisher.setPublicBaseUrl("");
    tunnel?.kill?.("SIGTERM");
    let serverClosed;
    if (server.listening) {
      serverClosed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      server.closeAllConnections?.();
    }
    if (serverClosed) await serverClosed;
    runtime.close();
    await web.close();
  }
  return {
    runtime,
    server,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      });
      if (publicTunnel) {
        try {
          tunnel = await launchProviderMediaTunnel({ port, runtime, spawnImpl: options.spawnImpl, fetchImpl: options.fetchImpl });
          tunnel.once("exit", async (code) => {
            if (closing) return;
            console.error(`cloudflared exited with code ${code ?? "unknown"}; closing UnunuTV so the UI cannot submit stale media URLs.`);
            await close();
          });
        } catch (error) {
          await close();
          throw error;
        }
      }
      return server.address();
    },
    close
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const publicTunnel = process.env.UNUTV_DISABLE_PUBLIC_TUNNEL !== "1";
  const service = await createUnuTvWebServer({ publicTunnel });
  const address = await service.listen();
  console.log(`UnunuTV local full-stack: http://127.0.0.1:${address.port}`);
  console.log(`Provider media tunnel: ${publicTunnel ? "ready" : "disabled"}`);
  console.log(`Data: ${service.runtime.dataRoot}`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await service.close(); process.exit(0); });
}
