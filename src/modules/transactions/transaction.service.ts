import { z } from "zod";
import type { EventPublisher } from "../../realtime/events.js";
import { AppError } from "../../shared/errors.js";
import type { Page, PageWindow } from "../../shared/pagination.js";
import type {
  CategoryRecord,
  TransactionFilter,
  TransactionRecord,
  TransactionRepository,
} from "./transaction.types.js";

const filterSchema = z.object({
  statementId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  search: z.string().trim().max(100).optional(),
});

export class TransactionService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly events: EventPublisher,
  ) {}

  list(
    userId: string,
    filter: TransactionFilter,
    window: PageWindow,
  ): Promise<Page<TransactionRecord>> {
    return this.transactions.listOwned(userId, filterSchema.parse(filter), window);
  }

  listCategories(): Promise<CategoryRecord[]> {
    return this.transactions.listCategories();
  }

  async updateCategory(
    userId: string,
    transactionId: string,
    categoryId: string,
  ): Promise<TransactionRecord> {
    const transaction = await this.transactions.findOwned(userId, z.uuid().parse(transactionId));
    if (!transaction) {
      throw new AppError("NOT_FOUND", "Transaction not found");
    }
    if (!(await this.transactions.categoryExists(z.uuid().parse(categoryId)))) {
      throw new AppError("NOT_FOUND", "Category not found");
    }
    const updated = await this.transactions.assignCategory(userId, transaction, categoryId);
    await this.events.publishToUser(userId, { type: "transaction.updated", transactionId });
    return updated;
  }
}
