import { describe, expect, it } from "vitest";
import type {
  AnalysisContext,
  AnalysisEngineGateway,
  AnalysisReport,
  AnalysisRepository,
  AnalysisRequest,
} from "../src/modules/analysis/analysis.types.js";
import { RemoteAnalyzer } from "../src/modules/analysis/remote.analyzer.js";
import { RecordingPublisher } from "./support/ledger.js";

const CONTEXT: AnalysisContext = {
  statementEntryIds: new Set(["current"]),
  history: [],
  currentBalanceCents: 10n,
  periodEnd: "2026-10-31",
  locale: "es",
  knownCategories: { UBER: "transport" },
};

const REPORT: AnalysisReport = {
  categorized: ["current", "older"].map((entryId) => ({
    entryId,
    merchant: "CAFE",
    categoryCode: "food",
    learnedByModel: false,
  })),
  anomalies: ["current", "older"].map((entryId) => ({ entryId, reason: "x", score: 3 })),
  recurring: [],
  antExpenses: [],
  forecast: {
    expectedIncomeCents: 0,
    expectedExpenseCents: 0,
    projectedCents: 0,
    dailyTrendCents: 0,
  },
  advice: [],
};

class FakeRepository implements AnalysisRepository {
  saved?: AnalysisReport;

  async loadContext(): Promise<AnalysisContext> {
    return CONTEXT;
  }

  async saveReport(_statementId: string, _userId: string, report: AnalysisReport): Promise<void> {
    this.saved = report;
  }
}

class FakeEngine implements AnalysisEngineGateway {
  request?: AnalysisRequest;

  constructor(private readonly error?: Error) {}

  async analyze(
    request: AnalysisRequest,
    onStage: Parameters<AnalysisEngineGateway["analyze"]>[1],
  ): Promise<AnalysisReport> {
    this.request = request;
    await onStage("CATEGORIZING");
    if (this.error) {
      throw this.error;
    }
    return REPORT;
  }
}

function setup(error?: Error) {
  const repository = new FakeRepository();
  const engine = new FakeEngine(error);
  const events = new RecordingPublisher();
  return { repository, engine, events, analyzer: new RemoteAnalyzer(repository, engine, events) };
}

describe("RemoteAnalyzer", () => {
  it("sends the learned categories to the engine", async () => {
    const { analyzer, engine } = setup();

    await analyzer.analyze("statement", "user");

    expect(engine.request?.knownCategories).toEqual({ UBER: "transport" });
  });

  it("only updates rows that belong to the analyzed statement", async () => {
    const { analyzer, repository } = setup();

    await analyzer.analyze("statement", "user");

    expect(repository.saved?.categorized.map((item) => item.entryId)).toEqual(["current"]);
    expect(repository.saved?.anomalies.map((item) => item.entryId)).toEqual(["current"]);
  });

  it("forwards engine stages to the owner", async () => {
    const { analyzer, events } = setup();

    await analyzer.analyze("statement", "user");

    expect(events.toUser).toEqual([
      {
        userId: "user",
        event: { type: "statement.stage", statementId: "statement", stage: "CATEGORIZING" },
      },
    ]);
  });

  it("saves nothing when the engine fails", async () => {
    const { analyzer, repository } = setup(new Error("engine down"));

    await expect(analyzer.analyze("statement", "user")).rejects.toThrow("engine down");
    expect(repository.saved).toBeUndefined();
  });
});
