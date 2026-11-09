import type { EntryKind } from "../statements/statement.types.js";

export interface AnalysisEntry {
  id: string;
  occurredOn: string;
  description: string;
  merchant: string;
  type: EntryKind;
  amountCents: bigint;
}

export interface AnalysisContext {
  statementEntryIds: Set<string>;
  history: AnalysisEntry[];
  currentBalanceCents: bigint;
  periodEnd: string;
  locale: string;
  knownCategories: Record<string, string>;
}

export interface AnalysisRequest extends Omit<AnalysisContext, "statementEntryIds"> {}

export interface Categorized {
  entryId: string;
  merchant: string;
  categoryCode: string;
  learnedByModel: boolean;
}

export interface AnomalyFinding {
  entryId: string;
  reason: string;
  score: number;
}

export interface RecurringFinding {
  merchant: string;
  averageCents: number;
  intervalDays: number;
  occurrences: number;
}

export interface AntExpenseFinding {
  merchant: string;
  categoryCode: string;
  count: number;
  totalCents: number;
  averageCents: number;
  periodStart: string;
  periodEnd: string;
}

export interface ForecastFinding {
  expectedIncomeCents: number;
  expectedExpenseCents: number;
  projectedCents: number;
  dailyTrendCents: number;
}

export interface AdviceFinding {
  title: string;
  detail: string;
}

export interface AnalysisReport {
  categorized: Categorized[];
  anomalies: AnomalyFinding[];
  recurring: RecurringFinding[];
  antExpenses: AntExpenseFinding[];
  forecast: ForecastFinding;
  advice: AdviceFinding[];
}

export type AnalysisStageName =
  | "CATEGORIZING"
  | "DETECTING_ANOMALIES"
  | "FINDING_PATTERNS"
  | "FORECASTING"
  | "RECOMMENDING";

export interface AnalysisEngineGateway {
  analyze(
    request: AnalysisRequest,
    onStage: (stage: AnalysisStageName) => Promise<void>,
  ): Promise<AnalysisReport>;
}

export interface AnalysisRepository {
  loadContext(statementId: string, userId: string): Promise<AnalysisContext>;
  saveReport(statementId: string, userId: string, report: AnalysisReport): Promise<void>;
}
