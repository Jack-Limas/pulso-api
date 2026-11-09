import { Code, type ConnectError } from "@connectrpc/connect";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { CategorySource, StatementStatus, TransactionType } from "../src/gen/pulso/v1/common_pb.js";
import { ProcessingMode } from "../src/gen/pulso/v1/statement_service_pb.js";
import { bearer, createHarness, VALID_USER } from "./support/harness.js";

async function codeOf(call: Promise<unknown>): Promise<Code | undefined> {
  return call.then(
    () => undefined,
    (reason: unknown) => (reason as ConnectError).code,
  );
}

const entry = (description: string, occurredOn = "2026-10-05", amountCents = 800_000n) => ({
  occurredOn,
  description,
  type: TransactionType.EXPENSE,
  amountCents,
});

describe("statements and transactions", () => {
  let harness: ReturnType<typeof createHarness>;
  let token: ReturnType<typeof bearer>;
  let userId: string;
  let accountId: string;

  const signUp = async (email: string) => {
    const session = await harness.authClient.register({ ...VALID_USER, email });
    return { token: bearer(session.accessToken), id: session.user!.id };
  };

  const upload = (overrides: object = {}, headers = token) =>
    harness.statementClient.uploadStatement(
      {
        bankAccountId: accountId,
        fileName: "octubre.pdf",
        fileHash: "a".repeat(64),
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
        openingBalanceCents: 100_000_000n,
        closingBalanceCents: 90_000_000n,
        transactions: [entry("COMPRA POS 1234 STARBUCKS #45"), entry("UBER *TRIP 8833")],
        metrics: { mode: ProcessingMode.WEB_WORKER, uploadMs: 40, processingMs: 120 },
        ...overrides,
      },
      headers,
    );

  beforeEach(async () => {
    harness = createHarness();
    const owner = await signUp("owner@example.com");
    token = owner.token;
    userId = owner.id;
    accountId = harness.ledger.grantAccount(userId);
  });

  it("stores the statement and reports each status in order", async () => {
    const { statement } = await upload();
    await harness.queue.onIdle();

    expect(statement?.transactionCount).toBe(2);
    expect(harness.events.statuses()).toEqual([
      "RECEIVED",
      "PROCESSING",
      "ANALYZING",
      "COMPLETED",
    ]);
    const stored = await harness.statementClient.getStatement({ id: statement!.id }, token);
    expect(stored.statement?.status).toBe(StatementStatus.COMPLETED);
  });

  it("sends status events only to the owner", async () => {
    await upload();
    await harness.queue.onIdle();

    expect(new Set(harness.events.toUser.map((sent) => sent.userId))).toEqual(new Set([userId]));
  });

  it("marks the statement as failed without leaking the cause", async () => {
    harness.analyzer.shouldFail = true;

    const { statement } = await upload();
    await harness.queue.onIdle();

    const stored = await harness.statementClient.getStatement({ id: statement!.id }, token);
    expect(stored.statement?.status).toBe(StatementStatus.FAILED);
    expect(stored.statement?.failureReason).not.toContain("engine");
  });

  it("rejects the same file twice", async () => {
    await upload();

    expect(await codeOf(upload())).toBe(Code.AlreadyExists);
  });

  it.each([
    ["no transactions", { transactions: [] }],
    ["a malformed hash", { fileHash: "not-a-hash" }],
    ["an inverted period", { periodStart: "2026-11-01" }],
    ["an impossible date", { transactions: [entry("X", "2026-02-31")] }],
    ["a transaction outside the period", { transactions: [entry("X", "2026-12-01")] }],
    ["a zero amount", { transactions: [entry("X", "2026-10-05", 0n)] }],
    ["a missing type", { transactions: [{ ...entry("X"), type: TransactionType.UNSPECIFIED }] }],
    ["missing metrics", { metrics: undefined }],
  ])("rejects %s", async (_case, overrides) => {
    expect(await codeOf(upload(overrides))).toBe(Code.InvalidArgument);
  });

  it("does not accept uploads to another user's account", async () => {
    const intruder = await signUp("intruder@example.com");

    expect(await codeOf(upload({}, intruder.token))).toBe(Code.NotFound);
  });

  it("isolates statements and transactions between users", async () => {
    const { statement } = await upload();
    const intruder = await signUp("intruder@example.com");

    const list = await harness.statementClient.listTransactions({}, intruder.token);

    expect(list.transactions).toHaveLength(0);
    expect(
      await codeOf(harness.statementClient.getStatement({ id: statement!.id }, intruder.token)),
    ).toBe(Code.NotFound);
  });

  it("normalizes merchants and keeps the original description", async () => {
    await upload();

    const { transactions } = await harness.statementClient.listTransactions({}, token);

    expect(transactions[0]?.merchant).toBe("STARBUCKS");
    expect(transactions[0]?.description).toBe("COMPRA POS 1234 STARBUCKS #45");
  });

  it("filters by text", async () => {
    await upload();

    const { transactions } = await harness.statementClient.listTransactions(
      { search: "uber" },
      token,
    );

    expect(transactions.map((t) => t.merchant)).toEqual(["UBER TRIP"]);
  });

  it("paginates with a token until the end", async () => {
    await upload();

    const first = await harness.statementClient.listTransactions(
      { page: { pageSize: 1 } },
      token,
    );
    const second = await harness.statementClient.listTransactions(
      { page: { pageSize: 1, pageToken: first.page!.nextPageToken } },
      token,
    );

    expect(first.page?.totalCount).toBe(2);
    expect(first.transactions[0]?.id).not.toBe(second.transactions[0]?.id);
    expect(second.page?.nextPageToken).toBe("");
  });

  it("rejects a malformed page token", async () => {
    const call = harness.statementClient.listTransactions({ page: { pageToken: "abc" } }, token);

    expect(await codeOf(call)).toBe(Code.InvalidArgument);
  });

  it("learns from a manual category correction", async () => {
    await upload();
    const { transactions } = await harness.statementClient.listTransactions({}, token);
    const target = transactions[0]!;

    const { transaction } = await harness.statementClient.updateTransactionCategory(
      { transactionId: target.id, categoryId: harness.ledger.category.id },
      token,
    );

    expect(transaction?.categorySource).toBe(CategorySource.USER);
    expect(harness.ledger.rules.get(`${userId}:${target.merchant}`)).toBe(
      harness.ledger.category.id,
    );
  });

  it("rejects an unknown category", async () => {
    await upload();
    const { transactions } = await harness.statementClient.listTransactions({}, token);

    const call = harness.statementClient.updateTransactionCategory(
      { transactionId: transactions[0]!.id, categoryId: randomUUID() },
      token,
    );

    expect(await codeOf(call)).toBe(Code.NotFound);
  });
});
