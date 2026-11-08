import type { ServiceImpl } from "@connectrpc/connect";
import {
  type BankAccountService as BankAccountContract,
  AccountType,
} from "../../gen/pulso/v1/bank_account_service_pb.js";
import { requireUser } from "../../rpc/request-context.js";
import { AppError } from "../../shared/errors.js";
import type { BankAccountService } from "./bank-account.service.js";
import type { AccountKind, BankAccountRecord } from "./bank-account.types.js";

const KIND_BY_PROTO = new Map<AccountType, AccountKind>([
  [AccountType.SAVINGS, "SAVINGS"],
  [AccountType.CHECKING, "CHECKING"],
  [AccountType.DIGITAL_WALLET, "DIGITAL_WALLET"],
]);
const PROTO_BY_KIND = new Map([...KIND_BY_PROTO].map(([proto, kind]) => [kind, proto]));

function toProtoAccount(account: BankAccountRecord) {
  return {
    id: account.id,
    bank: account.bank,
    alias: account.alias,
    type: PROTO_BY_KIND.get(account.type) ?? AccountType.UNSPECIFIED,
    ...(account.lastFourDigits ? { lastFourDigits: account.lastFourDigits } : {}),
  };
}

export function createBankAccountHandlers(
  accounts: BankAccountService,
): ServiceImpl<typeof BankAccountContract> {
  return {
    async listSupportedBanks() {
      return { banks: await accounts.listBanks() };
    },
    async listBankAccounts(_request, context) {
      const list = await accounts.list(requireUser(context).id);
      return { accounts: list.map(toProtoAccount) };
    },
    async createBankAccount(request, context) {
      const type = KIND_BY_PROTO.get(request.type);
      if (!type) {
        throw new AppError("INVALID_INPUT", "Account type is required");
      }
      const account = await accounts.create(requireUser(context).id, {
        supportedBankId: request.supportedBankId,
        alias: request.alias,
        type,
        lastFourDigits: request.lastFourDigits,
      });
      return { account: toProtoAccount(account) };
    },
    async deleteBankAccount(request, context) {
      await accounts.delete(requireUser(context).id, request.id);
      return {};
    },
  };
}
