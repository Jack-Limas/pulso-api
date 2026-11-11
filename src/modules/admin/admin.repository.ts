import type { PrismaClient } from "@prisma/client";
import type { Page, PageWindow } from "../../shared/pagination.js";
import type { UserRecord } from "../auth/auth.types.js";
import type { AdminRepository, ProcessingStats } from "./admin.types.js";

export class PrismaAdminRepository implements AdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listUsers({ offset, limit }: PageWindow): Promise<Page<UserRecord>> {
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ orderBy: { createdAt: "desc" }, skip: offset, take: limit }),
      this.prisma.user.count(),
    ]);
    return { items, total };
  }

  async categoryExists(id: string): Promise<boolean> {
    return (await this.prisma.category.count({ where: { id } })) > 0;
  }

  // Postgres treats NULL user ids as distinct, so the unique index cannot back an upsert here.
  async upsertGlobalRule(pattern: string, categoryId: string): Promise<string> {
    const existing = await this.prisma.merchantRule.findFirst({
      where: { userId: null, pattern },
      select: { id: true },
    });
    const rule = existing
      ? await this.prisma.merchantRule.update({
          where: { id: existing.id },
          data: { categoryId, source: "RULE" },
        })
      : await this.prisma.merchantRule.create({
          data: { pattern, categoryId, source: "RULE" },
        });
    return rule.id;
  }

  async processingStats(): Promise<ProcessingStats> {
    const [statementsProcessed, transactionsProcessed, byMode] = await Promise.all([
      this.prisma.bankStatement.count({ where: { status: "COMPLETED" } }),
      this.prisma.transaction.count(),
      this.prisma.processingMetric.groupBy({ by: ["mode"], _avg: { processingMs: true } }),
    ]);
    const averageOf = (mode: "WEB_WORKER" | "MAIN_THREAD") =>
      Math.round(byMode.find((row) => row.mode === mode)?._avg.processingMs ?? 0);
    return {
      statementsProcessed,
      transactionsProcessed: BigInt(transactionsProcessed),
      averageMsByMode: {
        WEB_WORKER: averageOf("WEB_WORKER"),
        MAIN_THREAD: averageOf("MAIN_THREAD"),
      },
    };
  }

  async audit(userId: string, action: string, metadata: Record<string, string>): Promise<void> {
    await this.prisma.auditLog.create({ data: { userId, action, metadata } });
  }
}
