import { z } from "zod";
import type { EventPublisher } from "../../realtime/events.js";
import type { PresenceStore } from "../../realtime/presence.js";
import { AppError } from "../../shared/errors.js";
import type { Page, PageWindow } from "../../shared/pagination.js";
import type { UserRecord } from "../auth/auth.types.js";
import { normalizeMerchant } from "../statements/merchant.normalizer.js";
import type { AdminRepository, ProcessingStats } from "./admin.types.js";

const announcementSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(500),
});

const ruleSchema = z.object({
  pattern: z.string().trim().min(2).max(80),
  categoryId: z.uuid(),
});

export interface PlatformMetrics extends ProcessingStats {
  connectedUsers: number;
  activeConnections: number;
}

export class AdminService {
  constructor(
    private readonly admin: AdminRepository,
    private readonly events: EventPublisher,
    private readonly presence: PresenceStore,
  ) {}

  async broadcast(adminId: string, input: { title: string; body: string }): Promise<void> {
    const announcement = announcementSchema.parse(input);
    await this.events.broadcast({ type: "announcement", ...announcement });
    await this.admin.audit(adminId, "announcement.broadcast", { title: announcement.title });
  }

  listUsers(window: PageWindow): Promise<Page<UserRecord>> {
    return this.admin.listUsers(window);
  }

  /** Global rules apply to every user who has not taught the system something different. */
  async upsertRule(adminId: string, input: { pattern: string; categoryId: string }) {
    const { pattern, categoryId } = ruleSchema.parse(input);
    if (!(await this.admin.categoryExists(categoryId))) {
      throw new AppError("NOT_FOUND", "Category not found");
    }
    const merchant = normalizeMerchant(pattern);
    const id = await this.admin.upsertGlobalRule(merchant, categoryId);
    await this.admin.audit(adminId, "merchant_rule.upsert", { pattern: merchant, categoryId });
    return id;
  }

  async metrics(): Promise<PlatformMetrics> {
    const [stats, snapshots] = await Promise.all([
      this.admin.processingStats(),
      this.presence.readAll(),
    ]);
    // One person on two devices may sit on two instances; the set counts them once.
    const users = new Set(snapshots.flatMap((snapshot) => snapshot.userIds));
    return {
      ...stats,
      connectedUsers: users.size,
      activeConnections: snapshots.reduce((sum, snapshot) => sum + snapshot.connections, 0),
    };
  }
}
