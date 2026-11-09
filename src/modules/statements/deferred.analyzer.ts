import type { StatementAnalyzer } from "./statement.types.js";

/** Placeholder until the pulso-ai client is connected. */
export class DeferredAnalyzer implements StatementAnalyzer {
  async analyze(): Promise<void> {}
}
