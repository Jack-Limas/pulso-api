import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance, instanceId: string): void {
  app.get("/health", async () => ({ status: "ok", instanceId }));
}
