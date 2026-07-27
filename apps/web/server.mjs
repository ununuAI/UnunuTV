import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { handleUnuTvRequest } from "@ununu/unutv-api";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

const applicationDirectory = path.dirname(fileURLToPath(import.meta.url));

function isLoopbackRequest(request) {
  const hostname = String(request.headers.host || "").split(":", 1)[0].replace(/^\[|\]$/g, "").toLowerCase();
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

export async function createUnuTvWebServer(options = {}) {
  const dev = options.dev ?? process.env.UNUTV_WEB_DEV === "1";
  const host = options.host || "127.0.0.1";
  const port = Number(options.port || process.env.UNUTV_PORT || 4318);
  const runtime = createLocalRuntime({ dataRoot: options.dataRoot, provider: options.provider, publisher: options.publisher });
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
  return {
    runtime,
    server,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      });
      return server.address();
    },
    async close() {
      if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      runtime.close();
      await web.close();
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const service = await createUnuTvWebServer();
  const address = await service.listen();
  console.log(`UnunuTV local full-stack: http://127.0.0.1:${address.port}`);
  console.log(`Data: ${service.runtime.dataRoot}`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await service.close(); process.exit(0); });
}
