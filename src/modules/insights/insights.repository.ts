import type { PrismaClient } from "@prisma/client";
import type { DashboardData, DashboardScope, InsightsRepository } from "./insights.types.js";

export class PrismaInsightsRepository implements InsightsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async load(userId: string, scope: DashboardScope): Promise<DashboardData | null> {
    // Without an explicit statement, the dashboard shows the latest finished analysis.
    const statement = await this.prisma.bankStatement.findFirst({
      where: {
        bankAccount: { userId },
        ...(scope.statementId ? { id: scope.statementId } : { status: "COMPLETED" }),
        ...(scope.bankAccountId ? { bankAccountId: scope.bankAccountId } : {}),
      },
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      select: { id: true, closingBalanceCents: true },
    });
    if (!statement) {
      return null;
    }

    const statementId = statement.id;
    const [byType, byCategory, categories, flagged, findings] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ["type"],
        where: { statementId },
        _sum: { amountCents: true },
      }),
      this.prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { statementId, type: "EXPENSE" },
        _sum: { amountCents: true },
      }),
      this.prisma.category.findMany({ select: { id: true, code: true } }),
      this.prisma.transaction.findMany({
        where: { statementId, status: "FLAGGED" },
        select: { id: true, description: true, amountCents: true },
        orderBy: { amountCents: "desc" },
      }),
      this.prisma.analysisResult.findMany({
        where: { statementId },
        select: { kind: true, payload: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const codeById = new Map(categories.map(({ id, code }) => [id, code]));
    const totalOf = (type: "INCOME" | "EXPENSE") =>
      byType.find((row) => row.type === type)?._sum.amountCents ?? 0n;

    return {
      closingBalanceCents: statement.closingBalanceCents,
      incomeCents: totalOf("INCOME"),
      expenseCents: totalOf("EXPENSE"),
      expenseByCategory: byCategory.map((row) => ({
        categoryCode: (row.categoryId && codeById.get(row.categoryId)) || "other",
        totalCents: row._sum.amountCents ?? 0n,
      })),
      flagged,
      findings,
    };
  }
}
