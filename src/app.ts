import cors from "@fastify/cors";
import { type ConnectRouter, cors as connectCors, type Interceptor } from "@connectrpc/connect";
import { fastifyConnectPlugin } from "@connectrpc/connect-fastify";
import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "./config/env.js";
import { registerHealthRoutes } from "./http/health.routes.js";

export interface AppOptions {
  env: Env;
  routes: (router: ConnectRouter) => void;
  interceptors: Interceptor[];
}

export async function buildApp({ env, routes, interceptors }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: env.NODE_ENV === "test" ? false : { level: env.LOG_LEVEL } });
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: [...connectCors.allowedMethods],
    allowedHeaders: [...connectCors.allowedHeaders, "Authorization"],
    exposedHeaders: [...connectCors.exposedHeaders],
  });
  registerHealthRoutes(app, env.INSTANCE_ID);
  await app.register(fastifyConnectPlugin, { routes, interceptors });
  return app;
}
