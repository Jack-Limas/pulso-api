import { randomUUID } from "node:crypto";
import type {
  NewStatement,
  StatementAnalyzer,
  StatementRecord,
  StatementRepository,
  StatementState,
} from "../../src/modules/statements/statement.types.js";
import type {
  CategoryRecord,
  TransactionFilter,
  TransactionRecord,
  TransactionRepository,
} from "../../src/modules/transactions/transaction.types.js";
import type { EventPublisher, RealtimeEvent } from "../../src/realtime/events.js";
import type { Page, PageWindow } from "../../src/shared/pagination.js";

export class RecordingPublisher implements EventPublisher {
  readonly toUser: { userId: string; event: RealtimeEvent }[] = [];

  async publishToUser(userId: string, event: RealtimeEvent): Promise<void> {
    this.toUser.push({ userId, event });
  }

  async broadcast(): Promise<void> {}

  statuses(): string[] {
    return this.toUser.flatMap(({ event }) =>
      event.type === "statement.status" ? [event.status] : [],
    );
  }
}

export class SwitchableAnalyzer implements StatementAnalyzer {
  shouldFail = false;

  async analyze(): Promise<void> {
    if (this.shouldFail) {
      throw new Error("Analysis engine unavailable");
    }
  }
}

export class InMemoryLedger implements StatementRepository, TransactionRepository {
  readonly category: CategoryRecord = { id: randomUUID(), code: "food", colorHex: "#FF2E4D" };
  readonly rules = new Map<string, string>();
  private readonly owners = new Map<string, string>();
  private readonly hashes = new Set<string>();
  private readonly statements = new Map<string, StatementRecord>();
  private readonly transactions: TransactionRecord[] = [];

  grantAccount(userId: string): string {
    const accountId = randomUUID();
    this.owners.set(accountId, userId);
    return accountId;
  }

  async ownsAccount(userId: string, bankAccountId: string): Promise<boolean> {
    return this.owners.get(bankAccountId) === userId;
  }

  async existsByHash(bankAccountId: string, fileHash: string): Promise<boolean> {
    return this.hashes.has(`${bankAccountId}:${fileHash}`);
  }

  async create({ entries, metrics: _metrics, fileHash, ...fields }: NewStatement) {
    const statement: StatementRecord = {
      ...fields,
      id: randomUUID(),
      status: "RECEIVED",
      failureReason: null,
      transactionCount: entries.length,
    };
    this.hashes.add(`${fields.bankAccountId}:${fileHash}`);
    this.statements.set(statement.id, statement);
    for (const entry of entries) {
      this.transactions.push({
        ...entry,
        id: randomUUID(),
        statementId: statement.id,
        status: "NORMAL",
        category: null,
        categorySource: null,
      });
    }
    return statement;
  }

  async findOwned(userId: string, id: string): Promise<never> {
    return (this.ownedStatement(userId, id) ?? this.ownedTransaction(userId, id) ?? null) as never;
  }

  async listOwned(
    userId: string,
    second: string | undefined | TransactionFilter,
    window: PageWindow,
  ): Promise<never> {
    const items =
      typeof second === "object"
        ? this.transactions.filter((t) => this.matches(userId, t, second))
        : [...this.statements.values()].filter(
            (s) =>
              this.owners.get(s.bankAccountId) === userId &&
              (second === undefined || s.bankAccountId === second),
          );
    return {
      items: items.slice(window.offset, window.offset + window.limit),
      total: items.length,
    } satisfies Page<unknown> as never;
  }

  async updateStatus(id: string, status: StatementState, failureReason?: string): Promise<void> {
    const statement = this.statements.get(id);
    if (statement) {
      statement.status = status;
      statement.failureReason = failureReason ?? null;
    }
  }

  async categoryExists(id: string): Promise<boolean> {
    return id === this.category.id;
  }

  async assignCategory(
    userId: string,
    transaction: TransactionRecord,
    categoryId: string,
  ): Promise<TransactionRecord> {
    transaction.category = this.category;
    transaction.categorySource = "USER";
    this.rules.set(`${userId}:${transaction.merchant}`, categoryId);
    return transaction;
  }

  private ownedStatement(userId: string, id: string): StatementRecord | undefined {
    const statement = this.statements.get(id);
    return statement && this.owners.get(statement.bankAccountId) === userId ? statement : undefined;
  }

  private ownedTransaction(userId: string, id: string): TransactionRecord | undefined {
    const transaction = this.transactions.find((candidate) => candidate.id === id);
    return transaction && this.ownedStatement(userId, transaction.statementId)
      ? transaction
      : undefined;
  }

  private matches(userId: string, t: TransactionRecord, filter: TransactionFilter): boolean {
    return (
      this.ownedStatement(userId, t.statementId) !== undefined &&
      (!filter.statementId || t.statementId === filter.statementId) &&
      (!filter.type || t.type === filter.type) &&
      (!filter.search || t.description.toLowerCase().includes(filter.search.toLowerCase()))
    );
  }
}
