import type { AnalysisKind, Prisma, PrismaClient } from "@prisma/client";
import { utcToIsoDate } from "../../shared/dates.js";
import type { AnalysisContext, AnalysisReport } from "./analysis.types.js";

const HISTORY_DAYS = 180;
const MS_PER_DAY = 86_400_000;

interface CategoryAssignment {
  categoryCode: string;
  source: "RULE" | "AI";
  ids: string[];
}

function groupAssignments(report: AnalysisReport): CategoryAssignment[] {
  const groups = new Map<string, CategoryAssignment>();
  for (const { categoryCode, entryId, learnedByModel } of report.categorized) {
    const source = learnedByModel ? "AI" : "RULE";
    const key = `${categoryCode}:${source}`;
    const group = groups.get(key) ?? { categoryCode, source, ids: [] };
    group.ids.push(entryId);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function toResults(statementId: string, report: AnalysisReport) {
  const rows = (kind: AnalysisKind, payloads: object[]) =>
    payloads.map((payload) => ({
      statementId,
      kind,
      payload: payload as Prisma.InputJsonObject,
    }));
  return [
    ...rows("ANOMALY", report.anomalies),
    ...rows("RECURRING", report.recurring),
    ...rows("ANT_EXPENSE", report.antExpenses),
    ...rows("FORECAST", [report.forecast]),
    ...rows("RECOMMENDATION", report.advice),
  ];
}

export class PrismaAnalysisRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async loadContext(statementId: string, userId: string): Promise<AnalysisContext> {
    const statement = await this.prisma.bankStatement.findUniqueOrThrow({
      where: { id: statementId },
      include: {
        transactions: { select: { id: true } },
        bankAccount: { select: { user: { select: { locale: true } } } },
      },
    });
    const since = new Date(statement.periodEnd.getTime() - HISTORY_DAYS * MS_PER_DAY);
    const [history, rules] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          occurredOn: { gte: since, lte: statement.periodEnd },
          statement: { bankAccountId: statement.bankAccountId },
        },
      }),
      this.prisma.merchantRule.findMany({
        where: { OR: [{ userId }, { userId: null }] },
        include: { category: { select: { code: true } } },
        // Global rules come first, so a user's own rule replaces them in the map below.
        orderBy: { userId: { sort: "desc", nulls: "first" } },
      }),
    ]);
    return {
      statementEntryIds: new Set(statement.transactions.map((transaction) => transaction.id)),
      history: history.map((row) => ({
        id: row.id,
        occurredOn: utcToIsoDate(row.occurredOn),
        description: row.description,
        merchant: row.merchant,
        type: row.type,
        amountCents: row.amountCents,
      })),
      currentBalanceCents: statement.closingBalanceCents,
      periodEnd: utcToIsoDate(statement.periodEnd),
      locale: statement.bankAccount.user.locale,
      knownCategories: Object.fromEntries(rules.map((r) => [r.pattern, r.category.code])),
    };
  }

  async saveReport(statementId: string, userId: string, report: AnalysisReport): Promise<void> {
    const categories = await this.prisma.category.findMany({ select: { id: true, code: true } });
    const categoryIdByCode = new Map(categories.map(({ code, id }) => [code, id]));
    const learned = new Map<string, string>();
    for (const item of report.categorized) {
      const categoryId = categoryIdByCode.get(item.categoryCode);
      if (item.learnedByModel && categoryId) {
        learned.set(item.merchant, categoryId);
      }
    }

    const updates = groupAssignments(report).flatMap(({ categoryCode, source, ids }) => {
      const categoryId = categoryIdByCode.get(categoryCode);
      if (!categoryId) {
        return [];
      }
      return this.prisma.transaction.updateMany({
        where: { id: { in: ids } },
        data: { categoryId, categorySource: source },
      });
    });

    await this.prisma.$transaction([
      ...updates,
      this.prisma.transaction.updateMany({
        where: { id: { in: report.anomalies.map((anomaly) => anomaly.entryId) } },
        data: { status: "FLAGGED" },
      }),
      this.prisma.merchantRule.createMany({
        data: [...learned].map(([pattern, categoryId]) => ({
          userId,
          pattern,
          categoryId,
          source: "AI" as const,
        })),
        skipDuplicates: true,
      }),
      this.prisma.analysisResult.deleteMany({ where: { statementId } }),
      this.prisma.analysisResult.createMany({ data: toResults(statementId, report) }),
    ]);
  }
}
