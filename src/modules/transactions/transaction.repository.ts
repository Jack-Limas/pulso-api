import type { Prisma, PrismaClient } from "@prisma/client";
import { utcToIsoDate } from "../../shared/dates.js";
import type { Page, PageWindow } from "../../shared/pagination.js";
import type {
  TransactionFilter,
  TransactionRecord,
  TransactionRepository,
} from "./transaction.types.js";

const TRANSACTION_INCLUDE = {
  category: { select: { id: true, code: true, colorHex: true } },
} as const;

type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof TRANSACTION_INCLUDE }>;

function toRecord(row: TransactionRow): TransactionRecord {
  return {
    id: row.id,
    statementId: row.statementId,
    occurredOn: utcToIsoDate(row.occurredOn),
    description: row.description,
    merchant: row.merchant,
    type: row.type,
    amountCents: row.amountCents,
    status: row.status,
    category: row.category,
    categorySource: row.categorySource,
  };
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listOwned(
    userId: string,
    { statementId, categoryId, type, search }: TransactionFilter,
    { offset, limit }: PageWindow,
  ): Promise<Page<TransactionRecord>> {
    const where: Prisma.TransactionWhereInput = {
      statement: { bankAccount: { userId } },
      ...(statementId ? { statementId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(type ? { type } : {}),
      ...(search ? { description: { contains: search, mode: "insensitive" as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: TRANSACTION_INCLUDE,
        orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
        skip: offset,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async findOwned(userId: string, id: string): Promise<TransactionRecord | null> {
    const row = await this.prisma.transaction.findFirst({
      where: { id, statement: { bankAccount: { userId } } },
      include: TRANSACTION_INCLUDE,
    });
    return row && toRecord(row);
  }

  async categoryExists(id: string): Promise<boolean> {
    return (await this.prisma.category.count({ where: { id } })) > 0;
  }

  // The correction becomes a rule, so this merchant is categorized correctly from now on.
  async assignCategory(
    userId: string,
    transaction: TransactionRecord,
    categoryId: string,
  ): Promise<TransactionRecord> {
    const pattern = transaction.merchant;
    const [row] = await this.prisma.$transaction([
      this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { categoryId, categorySource: "USER" },
        include: TRANSACTION_INCLUDE,
      }),
      this.prisma.merchantRule.upsert({
        where: { userId_pattern: { userId, pattern } },
        update: { categoryId, source: "USER" },
        create: { userId, pattern, categoryId, source: "USER" },
      }),
    ]);
    return toRecord(row);
  }
}
