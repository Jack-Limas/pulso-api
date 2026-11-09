import type { Page, PageWindow } from "../../shared/pagination.js";

export type StatementState =
  | "RECEIVED"
  | "PROCESSING"
  | "EXTRACTING"
  | "ANALYZING"
  | "COMPLETED"
  | "FAILED";
export type EntryKind = "INCOME" | "EXPENSE";
export type ProcessingModeKind = "MAIN_THREAD" | "WEB_WORKER";

export interface StatementRecord {
  id: string;
  bankAccountId: string;
  fileName: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceCents: bigint;
  closingBalanceCents: bigint;
  status: StatementState;
  failureReason: string | null;
  transactionCount: number;
}

export interface NewEntry {
  occurredOn: string;
  description: string;
  merchant: string;
  type: EntryKind;
  amountCents: bigint;
}

export interface NewStatement {
  bankAccountId: string;
  fileName: string;
  fileHash: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceCents: bigint;
  closingBalanceCents: bigint;
  entries: NewEntry[];
  metrics: {
    mode: ProcessingModeKind;
    uploadMs: number;
    processingMs: number;
    memoryBytes?: bigint | undefined;
  };
}

export interface StatementRepository {
  ownsAccount(userId: string, bankAccountId: string): Promise<boolean>;
  existsByHash(bankAccountId: string, fileHash: string): Promise<boolean>;
  create(statement: NewStatement): Promise<StatementRecord>;
  findOwned(userId: string, id: string): Promise<StatementRecord | null>;
  listOwned(
    userId: string,
    bankAccountId: string | undefined,
    window: PageWindow,
  ): Promise<Page<StatementRecord>>;
  updateStatus(id: string, status: StatementState, failureReason?: string): Promise<void>;
}

export interface StatementAnalyzer {
  analyze(statementId: string): Promise<void>;
}
