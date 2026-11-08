import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

describe("GET /health", () => {
  const app = buildApp(loadEnv({ NODE_ENV: "test", INSTANCE_ID: "test-a" }));

  afterAll(() => app.close());

  it("reports which instance answered", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", instanceId: "test-a" });
  });
});
