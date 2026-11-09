import { type Client, createClient, type Transport } from "@connectrpc/connect";
import { createConnectTransport, createGrpcTransport } from "@connectrpc/connect-node";
import {
  AnalysisEngineService,
  type AnalysisReport as ProtoReport,
  AnalysisStage,
  CategorizationMethod,
  EntryType,
} from "../../gen/pulso/ai/v1/analysis_engine_service_pb.js";
import type {
  AnalysisEngineGateway,
  AnalysisReport,
  AnalysisRequest,
  AnalysisStageName,
} from "./analysis.types.js";

export type AiTransportKind = "connect" | "grpc";

export interface AnalysisClientOptions {
  baseUrl: string;
  transport: AiTransportKind;
  internalKey: string;
  timeoutMs: number;
}

const API_KEY_HEADER = "x-internal-key";

const STAGE_NAMES = new Map<AnalysisStage, AnalysisStageName>([
  [AnalysisStage.CATEGORIZING, "CATEGORIZING"],
  [AnalysisStage.DETECTING_ANOMALIES, "DETECTING_ANOMALIES"],
  [AnalysisStage.FINDING_PATTERNS, "FINDING_PATTERNS"],
  [AnalysisStage.FORECASTING, "FORECASTING"],
  [AnalysisStage.RECOMMENDING, "RECOMMENDING"],
]);

// Connect runs over HTTP/1.1 behind proxies that cannot carry gRPC; gRPC needs HTTP/2 end to end.
function createTransport({ baseUrl, transport }: AnalysisClientOptions): Transport {
  return transport === "grpc"
    ? createGrpcTransport({ baseUrl })
    : createConnectTransport({ baseUrl, httpVersion: "1.1", useBinaryFormat: true });
}

function fromProto(report: ProtoReport): AnalysisReport {
  return {
    categorized: report.categorizedEntries.map((item) => ({
      entryId: item.entryId,
      merchant: item.merchant,
      categoryCode: item.categoryCode,
      learnedByModel: item.method === CategorizationMethod.MODEL,
    })),
    anomalies: report.anomalies.map(({ entryId, reason, score }) => ({ entryId, reason, score })),
    recurring: report.recurring.map((item) => ({
      merchant: item.merchant,
      averageCents: Number(item.averageCents),
      intervalDays: item.intervalDays,
      occurrences: item.occurrences,
    })),
    antExpenses: report.antExpenses.map((item) => ({
      merchant: item.merchant,
      categoryCode: item.categoryCode,
      count: item.count,
      totalCents: Number(item.totalCents),
      averageCents: Number(item.averageCents),
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
    })),
    forecast: {
      expectedIncomeCents: Number(report.forecast?.expectedIncomeCents ?? 0n),
      expectedExpenseCents: Number(report.forecast?.expectedExpenseCents ?? 0n),
      projectedCents: Number(report.forecast?.projectedCents ?? 0n),
      dailyTrendCents: Number(report.forecast?.dailyTrendCents ?? 0n),
    },
    advice: report.advice.map(({ title, detail }) => ({ title, detail })),
  };
}

export class AnalysisEngineClient implements AnalysisEngineGateway {
  private readonly client: Client<typeof AnalysisEngineService>;

  constructor(private readonly options: AnalysisClientOptions) {
    this.client = createClient(AnalysisEngineService, createTransport(options));
  }

  async analyze(
    request: AnalysisRequest,
    onStage: (stage: AnalysisStageName) => Promise<void>,
  ): Promise<AnalysisReport> {
    const stream = this.client.analyzeStatement(
      {
        entries: request.history.map((entry) => ({
          ...entry,
          type: entry.type === "INCOME" ? EntryType.INCOME : EntryType.EXPENSE,
        })),
        currentBalanceCents: request.currentBalanceCents,
        periodEnd: request.periodEnd,
        locale: request.locale,
        knownCategories: request.knownCategories,
      },
      {
        headers: { [API_KEY_HEADER]: this.options.internalKey },
        timeoutMs: this.options.timeoutMs,
      },
    );
    for await (const { event } of stream) {
      if (event.case === "report") {
        return fromProto(event.value);
      }
      const stage = event.case === "stage" ? STAGE_NAMES.get(event.value) : undefined;
      if (stage) {
        await onStage(stage);
      }
    }
    throw new Error("The analysis stream ended without a report");
  }
}
