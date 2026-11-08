import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "./config/env.js";
import { registerHealthRoutes } from "./http/health.routes.js";

export function buildApp(env: Env): FastifyInstance {
  const app = Fastify({ logger: env.NODE_ENV === "test" ? false : { level: env.LOG_LEVEL } });
  registerHealthRoutes(app, env.INSTANCE_ID);
  return app;
}
