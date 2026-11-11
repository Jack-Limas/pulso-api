import type { ServiceImpl } from "@connectrpc/connect";
import type { InsightsService as InsightsContract } from "../../gen/pulso/v1/insights_service_pb.js";
import { requireUser } from "../../rpc/request-context.js";
import type { InsightsService } from "./insights.service.js";

const cents = (value: number) => BigInt(Math.round(value));

export function createInsightsHandlers(
  insights: InsightsService,
): ServiceImpl<typeof InsightsContract> {
  return {
    async getDashboard(request, context) {
      const dashboard = await insights.getDashboard(requireUser(context).id, {
        bankAccountId: request.bankAccountId,
        statementId: request.statementId,
      });
      const { forecast } = dashboard;
      return {
        balanceCents: dashboard.balanceCents,
        incomeCents: dashboard.incomeCents,
        expenseCents: dashboard.expenseCents,
        categoryTotals: dashboard.categoryTotals,
        anomalies: dashboard.anomalies.map(({ id, ...anomaly }) => ({
          ...anomaly,
          transactionId: id,
        })),
        recurringExpenses: dashboard.recurring.map((item) => ({
          ...item,
          averageCents: cents(item.averageCents),
        })),
        antExpenses: dashboard.antExpenses.map((item) => ({
          ...item,
          totalCents: cents(item.totalCents),
          averageCents: cents(item.averageCents),
        })),
        forecast: {
          currentCents: forecast.currentCents,
          expectedIncomeCents: cents(forecast.expectedIncomeCents),
          expectedExpenseCents: cents(forecast.expectedExpenseCents),
          projectedCents: cents(forecast.projectedCents),
          dailyTrendCents: cents(forecast.dailyTrendCents),
        },
        recommendations: dashboard.recommendations,
      };
    },
  };
}
