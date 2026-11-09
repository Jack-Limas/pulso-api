import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance, instanceId: string): void {
  app.get("/health", (_request, reply) => reply.send({ status: "ok", instanceId }));
}
