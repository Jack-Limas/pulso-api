import type { EventPublisher } from "../../realtime/events.js";
import type { StatementAnalyzer, StatementRepository, StatementState } from "./statement.types.js";

export interface StatementJob {
  statementId: string;
  userId: string;
}

const FAILURE_REASON = "The statement could not be analyzed";

export class StatementProcessor {
  constructor(
    private readonly statements: StatementRepository,
    private readonly analyzer: StatementAnalyzer,
    private readonly events: EventPublisher,
    private readonly logError: (error: unknown) => void,
  ) {}

  async process(job: StatementJob): Promise<void> {
    try {
      await this.transition(job, "PROCESSING");
      await this.transition(job, "ANALYZING");
      await this.analyzer.analyze(job.statementId);
      await this.transition(job, "COMPLETED");
    } catch (error) {
      this.logError(error);
      await this.transition(job, "FAILED", FAILURE_REASON);
    }
  }

  private async transition(
    { statementId, userId }: StatementJob,
    status: StatementState,
    failureReason?: string,
  ): Promise<void> {
    await this.statements.updateStatus(statementId, status, failureReason);
    await this.events.publishToUser(userId, {
      type: "statement.status",
      statementId,
      status,
      ...(failureReason ? { failureReason } : {}),
    });
  }
}
