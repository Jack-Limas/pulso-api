import type { ConnectRouter, ServiceImpl } from "@connectrpc/connect";
import { AuthService } from "../gen/pulso/v1/auth_service_pb.js";
import { BankAccountService } from "../gen/pulso/v1/bank_account_service_pb.js";
import { StatementService } from "../gen/pulso/v1/statement_service_pb.js";

export interface RpcHandlers {
  auth: ServiceImpl<typeof AuthService>;
  bankAccounts: ServiceImpl<typeof BankAccountService>;
  statements: ServiceImpl<typeof StatementService>;
}

export function createRoutes(handlers: RpcHandlers) {
  return (router: ConnectRouter) => {
    router.service(AuthService, handlers.auth);
    router.service(BankAccountService, handlers.bankAccounts);
    router.service(StatementService, handlers.statements);
  };
}
