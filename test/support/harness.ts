import { createClient, createRouterTransport } from "@connectrpc/connect";
import { AuthService as AuthContract } from "../../src/gen/pulso/v1/auth_service_pb.js";
import { BankAccountService as BankAccountContract } from "../../src/gen/pulso/v1/bank_account_service_pb.js";
import { createAuthHandlers } from "../../src/modules/auth/auth.handlers.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { JwtIssuer } from "../../src/modules/auth/jwt.issuer.js";
import { RefreshCookie } from "../../src/modules/auth/refresh-cookie.js";
import { createBankAccountHandlers } from "../../src/modules/bank-accounts/bank-account.handlers.js";
import { BankAccountService } from "../../src/modules/bank-accounts/bank-account.service.js";
import { createAuthInterceptor } from "../../src/rpc/auth.interceptor.js";
import { createErrorInterceptor } from "../../src/rpc/error.interceptor.js";
import { StatementService as StatementContract } from "../../src/gen/pulso/v1/statement_service_pb.js";
import { createStatementHandlers } from "../../src/modules/statements/statement.handlers.js";
import { type StatementJob, StatementProcessor } from "../../src/modules/statements/statement.processor.js";
import { StatementService } from "../../src/modules/statements/statement.service.js";
import { TransactionService } from "../../src/modules/transactions/transaction.service.js";
import { createRoutes } from "../../src/rpc/routes.js";
import { ProcessingQueue } from "../../src/shared/processing-queue.js";
import { FakeHasher, InMemoryBankAccounts, InMemoryRefreshTokens, InMemoryUsers } from "./fakes.js";
import { InMemoryLedger, RecordingPublisher, SwitchableAnalyzer } from "./ledger.js";

const TEST_SECRET = "test-secret-with-at-least-32-characters";

export function createHarness() {
  const users = new InMemoryUsers();
  const refreshTokens = new InMemoryRefreshTokens();
  const bankAccountsRepository = new InMemoryBankAccounts();
  const accessTokens = new JwtIssuer(TEST_SECRET, 900);
  const auth = new AuthService(users, refreshTokens, new FakeHasher(), accessTokens, 30);
  const ledger = new InMemoryLedger();
  const events = new RecordingPublisher();
  const analyzer = new SwitchableAnalyzer();
  const silent = () => undefined;
  const processor = new StatementProcessor(ledger, analyzer, events, silent);
  const queue = new ProcessingQueue<StatementJob>((job) => processor.process(job), 2, silent);
  const statements = new StatementService(ledger, events, (job) => queue.enqueue(job));
  const transactions = new TransactionService(ledger, events);
  const routes = createRoutes({
    auth: createAuthHandlers(auth, new RefreshCookie(false, 30)),
    bankAccounts: createBankAccountHandlers(new BankAccountService(bankAccountsRepository)),
    statements: createStatementHandlers(statements, transactions),
  });
  const transport = createRouterTransport(routes, {
    router: {
      interceptors: [
        createErrorInterceptor((error) => {
          throw error;
        }),
        createAuthInterceptor(accessTokens),
      ],
    },
  });
  return {
    users,
    refreshTokens,
    bankAccountsRepository,
    ledger,
    events,
    analyzer,
    queue,
    statementClient: createClient(StatementContract, transport),
    authClient: createClient(AuthContract, transport),
    bankAccountClient: createClient(BankAccountContract, transport),
  };
}

export function bearer(accessToken: string) {
  return { headers: { authorization: `Bearer ${accessToken}` } };
}

export const VALID_USER = {
  email: "Ana@Example.com",
  password: "a-long-enough-password",
  fullName: "Ana Perez",
  locale: "es",
};
