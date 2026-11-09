import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createContainer } from "./container.js";

const env = loadEnv();
const container = createContainer(env, (error) => console.error(error));
const app = await buildApp({ env, routes: container.routes, interceptors: container.interceptors });
await container.realtime.start(app.server);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void container
      .close()
      .then(() => app.close())
      .then(() => process.exit(0));
  });
}

await app.listen({ host: "0.0.0.0", port: env.PORT });
