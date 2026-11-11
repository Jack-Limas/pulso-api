import type { ServiceImpl } from "@connectrpc/connect";
import {
  CategorySource,
  StatementStatus,
  TransactionStatus,
  TransactionType,
} from "../../gen/pulso/v1/common_pb.js";
import {
  ProcessingMode,
  type StatementService as StatementContract,
} from "../../gen/pulso/v1/statement_service_pb.js";
import { requireUser } from "../../rpc/request-context.js";
import { AppError } from "../../shared/errors.js";
import { toPageResponse, toPageWindow } from "../../shared/pagination.js";
import type { TransactionService } from "../transactions/transaction.service.js";
import type { CategoryOrigin, TransactionRecord } from "../transactions/transaction.types.js";
import type { StatementService } from "./statement.service.js";
import type { EntryKind, ProcessingModeKind, StatementRecord } from "./statement.types.js";

const KIND_BY_PROTO = new Map<TransactionType, EntryKind>([
  [TransactionType.INCOME, "INCOME"],
  [TransactionType.EXPENSE, "EXPENSE"],
]);
const MODE_BY_PROTO = new Map<ProcessingMode, ProcessingModeKind>([
  [ProcessingMode.MAIN_THREAD, "MAIN_THREAD"],
  [ProcessingMode.WEB_WORKER, "WEB_WORKER"],
]);
const SOURCE_TO_PROTO: Record<CategoryOrigin, CategorySource> = {
  RULE: CategorySource.RULE,
  AI: CategorySource.AI,
  USER: CategorySource.USER,
};

function required<K, V>(map: Map<K, V>, key: K, field: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new AppError("INVALID_INPUT", `Invalid fields: ${field}`);
  }
  return value;
}

function toProtoStatement(statement: StatementRecord) {
  const { failureReason, status, ...fields } = statement;
  return {
    ...fields,
    status: StatementStatus[status],
    ...(failureReason ? { failureReason } : {}),
  };
}

function toProtoTransaction(transaction: TransactionRecord) {
  const { category, categorySource, status, type, ...fields } = transaction;
  return {
    ...fields,
    type: type === "INCOME" ? TransactionType.INCOME : TransactionType.EXPENSE,
    status: TransactionStatus[status],
    ...(category ? { category } : {}),
    ...(categorySource ? { categorySource: SOURCE_TO_PROTO[categorySource] } : {}),
  };
}

export function createStatementHandlers(
  statements: StatementService,
  transactions: TransactionService,
): ServiceImpl<typeof StatementContract> {
  return {
    async uploadStatement(request, context) {
      if (!request.metrics) {
        throw new AppError("INVALID_INPUT", "Invalid fields: metrics");
      }
      const statement = await statements.upload(requireUser(context).id, {
        bankAccountId: request.bankAccountId,
        fileName: request.fileName,
        fileHash: request.fileHash,
        periodStart: request.periodStart,
        periodEnd: request.periodEnd,
        openingBalanceCents: request.openingBalanceCents,
        closingBalanceCents: request.closingBalanceCents,
        transactions: request.transactions.map((transaction) => ({
          occurredOn: transaction.occurredOn,
          description: transaction.description,
          amountCents: transaction.amountCents,
          type: required(KIND_BY_PROTO, transaction.type, "transactions.type"),
        })),
        metrics: {
          mode: required(MODE_BY_PROTO, request.metrics.mode, "metrics.mode"),
          uploadMs: request.metrics.uploadMs,
          processingMs: request.metrics.processingMs,
          memoryBytes: request.metrics.memoryBytes,
        },
      });
      return { statement: toProtoStatement(statement) };
    },
    async listStatements(request, context) {
      const window = toPageWindow(request.page?.pageSize, request.page?.pageToken);
      const page = await statements.list(
        requireUser(context).id,
        request.bankAccountId,
        window,
      );
      return {
        statements: page.items.map(toProtoStatement),
        page: toPageResponse(window, page.total),
      };
    },
    async getStatement(request, context) {
      return {
        statement: toProtoStatement(await statements.get(requireUser(context).id, request.id)),
      };
    },
    async listTransactions(request, context) {
      const window = toPageWindow(request.page?.pageSize, request.page?.pageToken);
      const page = await transactions.list(
        requireUser(context).id,
        {
          statementId: request.statementId,
          categoryId: request.categoryId,
          type: request.type === undefined ? undefined : KIND_BY_PROTO.get(request.type),
          search: request.search,
        },
        window,
      );
      return {
        transactions: page.items.map(toProtoTransaction),
        page: toPageResponse(window, page.total),
      };
    },
    async listCategories() {
      return { categories: await transactions.listCategories() };
    },
    async updateTransactionCategory(request, context) {
      const transaction = await transactions.updateCategory(
        requireUser(context).id,
        request.transactionId,
        request.categoryId,
      );
      return { transaction: toProtoTransaction(transaction) };
    },
  };
}
