import type {
  AdviceFinding,
  AntExpenseFinding,
  ForecastFinding,
  RecurringFinding,
} from "../analysis/analysis.types.js";

export interface DashboardScope {
  bankAccountId?: string | undefined;
  statementId?: string | undefined;
}

export interface FlaggedTransaction {
  id: string;
  description: string;
  amountCents: bigint;
}

export interface StoredFinding {
  kind: "ANOMALY" | "RECURRING" | "ANT_EXPENSE" | "FORECAST" | "RECOMMENDATION";
  payload: unknown;
}

export interface DashboardData {
  closingBalanceCents: bigint;
  incomeCents: bigint;
  expenseCents: bigint;
  expenseByCategory: { categoryCode: string; totalCents: bigint }[];
  flagged: FlaggedTransaction[];
  findings: StoredFinding[];
}

export interface Dashboard {
  balanceCents: bigint;
  incomeCents: bigint;
  expenseCents: bigint;
  categoryTotals: { categoryCode: string; totalCents: bigint }[];
  anomalies: (FlaggedTransaction & { reason: string })[];
  recurring: RecurringFinding[];
  antExpenses: AntExpenseFinding[];
  forecast: ForecastFinding & { currentCents: bigint };
  recommendations: AdviceFinding[];
}

export interface InsightsRepository {
  /** Resolves the scope to one statement owned by the user, or null when there is none. */
  load(userId: string, scope: DashboardScope): Promise<DashboardData | null>;
}
