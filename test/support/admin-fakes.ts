import { randomUUID } from "node:crypto";
import type { AdminRepository, ProcessingStats } from "../../src/modules/admin/admin.types.js";
import type { UserRecord } from "../../src/modules/auth/auth.types.js";
import type { DashboardData, InsightsRepository } from "../../src/modules/insights/insights.types.js";
import type { PresenceSnapshot, PresenceStore } from "../../src/realtime/presence.js";
import type { Page } from "../../src/shared/pagination.js";

export class FakeAdmin implements AdminRepository {
  readonly categoryId = randomUUID();
  readonly rules = new Map<string, string>();
  readonly audits: string[] = [];

  async listUsers(): Promise<Page<UserRecord>> {
    return { items: [], total: 0 };
  }

  async categoryExists(id: string): Promise<boolean> {
    return id === this.categoryId;
  }

  async upsertGlobalRule(pattern: string, categoryId: string): Promise<string> {
    this.rules.set(pattern, categoryId);
    return pattern;
  }

  async processingStats(): Promise<ProcessingStats> {
    return {
      statementsProcessed: 3,
      transactionsProcessed: 120n,
      averageMsByMode: { WEB_WORKER: 40, MAIN_THREAD: 90 },
    };
  }

  async audit(_userId: string, action: string): Promise<void> {
    this.audits.push(action);
  }
}

export class FakePresence implements PresenceStore {
  snapshots: PresenceSnapshot[] = [];

  async report(): Promise<void> {}

  async readAll(): Promise<PresenceSnapshot[]> {
    return this.snapshots;
  }
}

export class FakeInsights implements InsightsRepository {
  data: DashboardData | null = null;

  async load(): Promise<DashboardData | null> {
    return this.data;
  }
}
