import { createUnuTvServer } from "./server.mjs";

const service = createUnuTvServer();
const port = Number(process.env.UNUTV_PORT || 4318);
const address = await service.listen(port);
console.log(`UnunuTV local server: http://127.0.0.1:${address.port}`);
console.log(`Data: ${service.runtime.dataRoot}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await service.close();
    process.exit(0);
  });
}
