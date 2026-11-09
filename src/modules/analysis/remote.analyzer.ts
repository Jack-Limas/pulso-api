import type { EventPublisher } from "../../realtime/events.js";
import type { StatementAnalyzer } from "../statements/statement.types.js";
import type { AnalysisEngineGateway, AnalysisRepository } from "./analysis.types.js";

export class RemoteAnalyzer implements StatementAnalyzer {
  constructor(
    private readonly repository: AnalysisRepository,
    private readonly engine: AnalysisEngineGateway,
    private readonly events: EventPublisher,
  ) {}

  async analyze(statementId: string, userId: string): Promise<void> {
    const { statementEntryIds, ...request } = await this.repository.loadContext(statementId, userId);
    const report = await this.engine.analyze(request, (stage) =>
      this.events.publishToUser(userId, { type: "statement.stage", statementId, stage }),
    );
    // The engine sees older months as a baseline, but only this statement's rows are updated.
    await this.repository.saveReport(statementId, userId, {
      ...report,
      categorized: report.categorized.filter((item) => statementEntryIds.has(item.entryId)),
      anomalies: report.anomalies.filter((item) => statementEntryIds.has(item.entryId)),
    });
  }
}
