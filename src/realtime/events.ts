import type { StatementState } from "../modules/statements/statement.types.js";

export type RealtimeEvent =
  | { type: "statement.status"; statementId: string; status: StatementState; failureReason?: string }
  | { type: "transaction.updated"; transactionId: string }
  | { type: "announcement"; title: string; body: string };

export interface EventPublisher {
  publishToUser(userId: string, event: RealtimeEvent): Promise<void>;
  broadcast(event: RealtimeEvent): Promise<void>;
}
