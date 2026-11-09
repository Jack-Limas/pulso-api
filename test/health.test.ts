import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

describe("GET /health", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      INSTANCE_ID: "test-a",
      DATABASE_URL: "postgresql://unused",
      REDIS_URL: "redis://unused",
      JWT_ACCESS_SECRET: "test-secret-with-at-least-32-characters",
    });
    app = await buildApp({ env, routes: () => undefined, interceptors: [] });
  });

  afterAll(() => app.close());

  it("reports which instance answered", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", instanceId: "test-a" });
  });
});
