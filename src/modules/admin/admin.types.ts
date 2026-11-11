import type { Page, PageWindow } from "../../shared/pagination.js";
import type { UserRecord } from "../auth/auth.types.js";

export interface ProcessingStats {
  statementsProcessed: number;
  transactionsProcessed: bigint;
  averageMsByMode: { WEB_WORKER: number; MAIN_THREAD: number };
}

export interface AdminRepository {
  listUsers(window: PageWindow): Promise<Page<UserRecord>>;
  categoryExists(id: string): Promise<boolean>;
  upsertGlobalRule(pattern: string, categoryId: string): Promise<string>;
  processingStats(): Promise<ProcessingStats>;
  audit(userId: string, action: string, metadata: Record<string, string>): Promise<void>;
}
