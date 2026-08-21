import { createUnuTvWebServer } from "@ununu/unutv-web";

const port = Number(process.env.UNUTV_PORT || 4318);
const service = await createUnuTvWebServer({ dev: true, port, publicTunnel: true });
await service.listen();
console.log(`UnunuTV local full-stack: http://127.0.0.1:${port}`);

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await service.close();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await close();
    process.exit(0);
  });
}
