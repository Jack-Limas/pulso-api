import type { ConnectRouter, ServiceImpl } from "@connectrpc/connect";
import { AuthService } from "../gen/pulso/v1/auth_service_pb.js";
import { BankAccountService } from "../gen/pulso/v1/bank_account_service_pb.js";
import { AdminService } from "../gen/pulso/v1/admin_service_pb.js";
import { InsightsService } from "../gen/pulso/v1/insights_service_pb.js";
import { StatementService } from "../gen/pulso/v1/statement_service_pb.js";

export interface RpcHandlers {
  auth: ServiceImpl<typeof AuthService>;
  bankAccounts: ServiceImpl<typeof BankAccountService>;
  statements: ServiceImpl<typeof StatementService>;
  insights: ServiceImpl<typeof InsightsService>;
  admin: ServiceImpl<typeof AdminService>;
}

export function createRoutes(handlers: RpcHandlers) {
  return (router: ConnectRouter) => {
    router.service(AuthService, handlers.auth);
    router.service(BankAccountService, handlers.bankAccounts);
    router.service(StatementService, handlers.statements);
    router.service(InsightsService, handlers.insights);
    router.service(AdminService, handlers.admin);
  };
}
