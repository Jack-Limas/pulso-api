import { Prisma, type PrismaClient } from "@prisma/client";
import { isoDateToUtc, utcToIsoDate } from "../../shared/dates.js";
import { AppError } from "../../shared/errors.js";
import type { Page, PageWindow } from "../../shared/pagination.js";
import type {
  NewStatement,
  StatementRecord,
  StatementRepository,
  StatementState,
} from "./statement.types.js";

const UNIQUE_VIOLATION = "P2002";
const STATEMENT_INCLUDE = { _count: { select: { transactions: true } } } as const;

type StatementRow = Prisma.BankStatementGetPayload<{ include: typeof STATEMENT_INCLUDE }>;

function toRecord(row: StatementRow): StatementRecord {
  return {
    id: row.id,
    bankAccountId: row.bankAccountId,
    fileName: row.fileName,
    periodStart: utcToIsoDate(row.periodStart),
    periodEnd: utcToIsoDate(row.periodEnd),
    openingBalanceCents: row.openingBalanceCents,
    closingBalanceCents: row.closingBalanceCents,
    status: row.status,
    failureReason: row.failureReason,
    transactionCount: row._count.transactions,
  };
}

export class PrismaStatementRepository implements StatementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async ownsAccount(userId: string, bankAccountId: string): Promise<boolean> {
    return (await this.prisma.bankAccount.count({ where: { id: bankAccountId, userId } })) > 0;
  }

  async existsByHash(bankAccountId: string, fileHash: string): Promise<boolean> {
    return (await this.prisma.bankStatement.count({ where: { bankAccountId, fileHash } })) > 0;
  }

  async create(statement: NewStatement): Promise<StatementRecord> {
    const { entries, metrics, periodStart, periodEnd, ...fields } = statement;
    try {
      const row = await this.prisma.bankStatement.create({
        data: {
          ...fields,
          periodStart: isoDateToUtc(periodStart),
          periodEnd: isoDateToUtc(periodEnd),
          transactions: {
            createMany: {
              data: entries.map((entry) => ({
                ...entry,
                occurredOn: isoDateToUtc(entry.occurredOn),
              })),
            },
          },
          processingMetric: {
            create: {
              mode: metrics.mode,
              uploadMs: metrics.uploadMs,
              processingMs: metrics.processingMs,
              memoryBytes: metrics.memoryBytes ?? null,
              transactionCount: entries.length,
            },
          },
        },
        include: STATEMENT_INCLUDE,
      });
      return toRecord(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new AppError("CONFLICT", "This statement was already uploaded");
      }
      throw error;
    }
  }

  async findOwned(userId: string, id: string): Promise<StatementRecord | null> {
    const row = await this.prisma.bankStatement.findFirst({
      where: { id, bankAccount: { userId } },
      include: STATEMENT_INCLUDE,
    });
    return row && toRecord(row);
  }

  async listOwned(
    userId: string,
    bankAccountId: string | undefined,
    { offset, limit }: PageWindow,
  ): Promise<Page<StatementRecord>> {
    const where: Prisma.BankStatementWhereInput = {
      bankAccount: { userId },
      ...(bankAccountId ? { bankAccountId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.bankStatement.findMany({
        where,
        include: STATEMENT_INCLUDE,
        orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
        skip: offset,
        take: limit,
      }),
      this.prisma.bankStatement.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async updateStatus(id: string, status: StatementState, failureReason?: string): Promise<void> {
    await this.prisma.bankStatement.update({
      where: { id },
      data: { status, failureReason: failureReason ?? null },
    });
  }
}
