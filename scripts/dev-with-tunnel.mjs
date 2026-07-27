import { spawn } from "node:child_process";
import { createUnuTvWebServer } from "@ununu/unutv-web";

const port = Number(process.env.UNUTV_PORT || 4318);
const service = await createUnuTvWebServer({ dev: true, port });
await service.listen();
console.log(`UnunuTV local full-stack: http://127.0.0.1:${port}`);

const tunnel = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"], {
  stdio: ["ignore", "pipe", "pipe"]
});

let publicUrl;
function inspect(chunk) {
  const text = chunk.toString("utf8");
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (match && !publicUrl) {
    publicUrl = match[0];
    service.runtime.publisher.setPublicBaseUrl(publicUrl);
    console.log(`Signed provider media tunnel: ${publicUrl}`);
    console.log("Public tunnel exposes only expiring /provider-media/ URLs; project API and UI remain loopback-only.");
  }
  for (const line of text.split("\n")) {
    if (line && !line.includes("trycloudflare.com")) console.error(`[tunnel] ${line}`);
  }
}

tunnel.stdout.on("data", inspect);
tunnel.stderr.on("data", inspect);
tunnel.on("error", async (error) => {
  console.error(`Unable to start cloudflared: ${error.message}`);
  await service.close();
  process.exitCode = 1;
});
tunnel.on("exit", async (code) => {
  if (code && code !== 0) console.error(`cloudflared exited with code ${code}`);
  await service.close();
  process.exitCode = code || 0;
});

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  tunnel.kill("SIGTERM");
  await service.close();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await close();
    process.exit(0);
  });
}
