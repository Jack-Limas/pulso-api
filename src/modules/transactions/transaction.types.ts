import type { Page, PageWindow } from "../../shared/pagination.js";
import type { EntryKind } from "../statements/statement.types.js";

export type TransactionState = "NORMAL" | "FLAGGED" | "REVIEWED";
export type CategoryOrigin = "RULE" | "AI" | "USER";

export interface CategoryRecord {
  id: string;
  code: string;
  colorHex: string;
}

export interface TransactionRecord {
  id: string;
  statementId: string;
  occurredOn: string;
  description: string;
  merchant: string;
  type: EntryKind;
  amountCents: bigint;
  status: TransactionState;
  category: CategoryRecord | null;
  categorySource: CategoryOrigin | null;
}

export interface TransactionFilter {
  statementId?: string | undefined;
  categoryId?: string | undefined;
  type?: EntryKind | undefined;
  search?: string | undefined;
}

export interface TransactionRepository {
  listOwned(
    userId: string,
    filter: TransactionFilter,
    window: PageWindow,
  ): Promise<Page<TransactionRecord>>;
  findOwned(userId: string, id: string): Promise<TransactionRecord | null>;
  listCategories(): Promise<CategoryRecord[]>;
  categoryExists(id: string): Promise<boolean>;
  assignCategory(
    userId: string,
    transaction: TransactionRecord,
    categoryId: string,
  ): Promise<TransactionRecord>;
}
