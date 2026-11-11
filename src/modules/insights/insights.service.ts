import { z } from "zod";
import type {
  AdviceFinding,
  AntExpenseFinding,
  AnomalyFinding,
  ForecastFinding,
  RecurringFinding,
} from "../analysis/analysis.types.js";
import type {
  Dashboard,
  DashboardData,
  DashboardScope,
  InsightsRepository,
  StoredFinding,
} from "./insights.types.js";

const scopeSchema = z.object({
  bankAccountId: z.uuid().optional(),
  statementId: z.uuid().optional(),
});

const EMPTY_FORECAST: ForecastFinding = {
  expectedIncomeCents: 0,
  expectedExpenseCents: 0,
  projectedCents: 0,
  dailyTrendCents: 0,
};

function payloadsOf<T>(findings: StoredFinding[], kind: StoredFinding["kind"]): T[] {
  return findings.filter((finding) => finding.kind === kind).map((finding) => finding.payload as T);
}

export function buildDashboard(data: DashboardData | null): Dashboard {
  if (!data) {
    return {
      balanceCents: 0n,
      incomeCents: 0n,
      expenseCents: 0n,
      categoryTotals: [],
      anomalies: [],
      recurring: [],
      antExpenses: [],
      forecast: { ...EMPTY_FORECAST, currentCents: 0n },
      recommendations: [],
    };
  }
  const reasonById = new Map(
    payloadsOf<AnomalyFinding>(data.findings, "ANOMALY").map((a) => [a.entryId, a.reason]),
  );
  const [forecast = EMPTY_FORECAST] = payloadsOf<ForecastFinding>(data.findings, "FORECAST");
  return {
    balanceCents: data.closingBalanceCents,
    incomeCents: data.incomeCents,
    expenseCents: data.expenseCents,
    categoryTotals: [...data.expenseByCategory].sort((a, b) =>
      a.totalCents === b.totalCents ? 0 : a.totalCents > b.totalCents ? -1 : 1,
    ),
    // A flag without a stored reason means a user reviewed it differently; it is still shown.
    anomalies: data.flagged.map((transaction) => ({
      ...transaction,
      reason: reasonById.get(transaction.id) ?? "",
    })),
    recurring: payloadsOf<RecurringFinding>(data.findings, "RECURRING"),
    antExpenses: payloadsOf<AntExpenseFinding>(data.findings, "ANT_EXPENSE"),
    forecast: { ...forecast, currentCents: data.closingBalanceCents },
    recommendations: payloadsOf<AdviceFinding>(data.findings, "RECOMMENDATION"),
  };
}

export class InsightsService {
  constructor(private readonly insights: InsightsRepository) {}

  async getDashboard(userId: string, scope: DashboardScope): Promise<Dashboard> {
    return buildDashboard(await this.insights.load(userId, scopeSchema.parse(scope)));
  }
}
