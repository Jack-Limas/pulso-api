import type { ServiceImpl } from "@connectrpc/connect";
import type { AdminService as AdminContract } from "../../gen/pulso/v1/admin_service_pb.js";
import { requireUser } from "../../rpc/request-context.js";
import { toPageResponse, toPageWindow } from "../../shared/pagination.js";
import { toProtoUser } from "../auth/auth.handlers.js";
import type { AdminService } from "./admin.service.js";

export function createAdminHandlers(admin: AdminService): ServiceImpl<typeof AdminContract> {
  return {
    async broadcastAnnouncement(request, context) {
      await admin.broadcast(requireUser(context).id, request);
      return {};
    },
    async listUsers(request) {
      const window = toPageWindow(request.page?.pageSize, request.page?.pageToken);
      const page = await admin.listUsers(window);
      return { users: page.items.map(toProtoUser), page: toPageResponse(window, page.total) };
    },
    async upsertMerchantRule(request, context) {
      return { id: await admin.upsertRule(requireUser(context).id, request) };
    },
    async getPlatformMetrics() {
      const metrics = await admin.metrics();
      return {
        connectedUsers: metrics.connectedUsers,
        activeConnections: metrics.activeConnections,
        statementsProcessed: metrics.statementsProcessed,
        transactionsProcessed: metrics.transactionsProcessed,
        averageProcessingMsWorker: metrics.averageMsByMode.WEB_WORKER,
        averageProcessingMsMainThread: metrics.averageMsByMode.MAIN_THREAD,
      };
    },
  };
}
