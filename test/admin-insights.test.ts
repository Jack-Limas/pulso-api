import { Code, type ConnectError } from "@connectrpc/connect";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildDashboard } from "../src/modules/insights/insights.service.js";
import { bearer, createHarness } from "./support/harness.js";

async function codeOf(call: Promise<unknown>): Promise<Code | undefined> {
  return call.then(
    () => undefined,
    (reason: unknown) => (reason as ConnectError).code,
  );
}

async function tokenFor(harness: ReturnType<typeof createHarness>, role: "USER" | "ADMIN") {
  return bearer(await harness.accessTokens.issue({ id: randomUUID(), role }));
}

describe("AdminService", () => {
  let harness: ReturnType<typeof createHarness>;
  let admin: ReturnType<typeof bearer>;

  beforeEach(async () => {
    harness = createHarness();
    admin = await tokenFor(harness, "ADMIN");
  });

  it("is closed to regular users", async () => {
    const user = await tokenFor(harness, "USER");

    expect(await codeOf(harness.adminClient.getPlatformMetrics({}, user))).toBe(
      Code.PermissionDenied,
    );
  });

  it("broadcasts an announcement to everyone and audits it", async () => {
    await harness.adminClient.broadcastAnnouncement({ title: "Nuevo banco", body: "Ya" }, admin);

    expect(harness.events.broadcasts).toEqual([
      { type: "announcement", title: "Nuevo banco", body: "Ya" },
    ]);
    expect(harness.adminRepository.audits).toEqual(["announcement.broadcast"]);
  });

  it("rejects an empty announcement", async () => {
    const call = harness.adminClient.broadcastAnnouncement({ title: " ", body: "x" }, admin);

    expect(await codeOf(call)).toBe(Code.InvalidArgument);
  });

  it("stores global rules under the normalized merchant", async () => {
    const { categoryId } = harness.adminRepository;

    await harness.adminClient.upsertMerchantRule(
      { pattern: "compra pos 123 kiosko luna", categoryId },
      admin,
    );

    expect(harness.adminRepository.rules.get("KIOSKO LUNA")).toBe(categoryId);
  });

  it("rejects a rule for an unknown category", async () => {
    const call = harness.adminClient.upsertMerchantRule(
      { pattern: "kiosko", categoryId: randomUUID() },
      admin,
    );

    expect(await codeOf(call)).toBe(Code.NotFound);
  });

  it("counts a user once even when connected to two instances", async () => {
    harness.presence.snapshots = [
      { instanceId: "api-a", connections: 2, userIds: ["u1", "u2"] },
      { instanceId: "api-b", connections: 1, userIds: ["u1"] },
    ];

    const metrics = await harness.adminClient.getPlatformMetrics({}, admin);

    expect(metrics.connectedUsers).toBe(2);
    expect(metrics.activeConnections).toBe(3);
    expect(metrics.averageProcessingMsWorker).toBe(40);
  });
});

describe("InsightsService", () => {
  const data = {
    closingBalanceCents: 500n,
    incomeCents: 1000n,
    expenseCents: 700n,
    expenseByCategory: [
      { categoryCode: "transport", totalCents: 200n },
      { categoryCode: "food", totalCents: 500n },
    ],
    flagged: [{ id: "t1", description: "REGALO", amountCents: 450n }],
    findings: [
      { kind: "ANOMALY" as const, payload: { entryId: "t1", reason: "Muy alto", score: 4 } },
      {
        kind: "FORECAST" as const,
        payload: {
          expectedIncomeCents: 1000,
          expectedExpenseCents: 800,
          projectedCents: 700,
          dailyTrendCents: -3,
        },
      },
      { kind: "RECOMMENDATION" as const, payload: { title: "Ahorra", detail: "Menos cafe" } },
    ],
  };

  it("joins flagged transactions with the reason the engine gave", () => {
    expect(buildDashboard(data).anomalies).toEqual([
      { id: "t1", description: "REGALO", amountCents: 450n, reason: "Muy alto" },
    ]);
  });

  it("orders categories from the largest expense", () => {
    const codes = buildDashboard(data).categoryTotals.map((total) => total.categoryCode);

    expect(codes).toEqual(["food", "transport"]);
  });

  it("uses the closing balance as current liquidity", () => {
    expect(buildDashboard(data).forecast).toMatchObject({ currentCents: 500n, projectedCents: 700 });
  });

  it("returns an empty dashboard before the first statement", () => {
    expect(buildDashboard(null)).toMatchObject({ balanceCents: 0n, anomalies: [] });
  });

  it("serves the dashboard over rpc with exact int64 values", async () => {
    const harness = createHarness();
    harness.insightsRepository.data = data;

    const dashboard = await harness.insightsClient.getDashboard(
      {},
      await tokenFor(harness, "USER"),
    );

    expect(dashboard.expenseCents).toBe(700n);
    expect(dashboard.forecast?.dailyTrendCents).toBe(-3n);
    expect(dashboard.anomalies[0]?.reason).toBe("Muy alto");
  });

  it("rejects a malformed scope", async () => {
    const harness = createHarness();

    const call = harness.insightsClient.getDashboard(
      { statementId: "nope" },
      await tokenFor(harness, "USER"),
    );

    expect(await codeOf(call)).toBe(Code.InvalidArgument);
  });
});
