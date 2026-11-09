import type { Interceptor } from "@connectrpc/connect";
import type { Env } from "./config/env.js";
import { createPrismaClient } from "./db/prisma.js";
import { Argon2Hasher } from "./modules/auth/argon2.hasher.js";
import { createAuthHandlers } from "./modules/auth/auth.handlers.js";
import {
  PrismaRefreshTokenRepository,
  PrismaUserRepository,
} from "./modules/auth/auth.repository.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { JwtIssuer } from "./modules/auth/jwt.issuer.js";
import { RefreshCookie } from "./modules/auth/refresh-cookie.js";
import { createBankAccountHandlers } from "./modules/bank-accounts/bank-account.handlers.js";
import { PrismaBankAccountRepository } from "./modules/bank-accounts/bank-account.repository.js";
import { BankAccountService } from "./modules/bank-accounts/bank-account.service.js";
import { AnalysisEngineClient } from "./modules/analysis/analysis-engine.client.js";
import { PrismaAnalysisRepository } from "./modules/analysis/analysis.repository.js";
import { RemoteAnalyzer } from "./modules/analysis/remote.analyzer.js";
import { createStatementHandlers } from "./modules/statements/statement.handlers.js";
import { type StatementJob, StatementProcessor } from "./modules/statements/statement.processor.js";
import { PrismaStatementRepository } from "./modules/statements/statement.repository.js";
import { StatementService } from "./modules/statements/statement.service.js";
import { PrismaTransactionRepository } from "./modules/transactions/transaction.repository.js";
import { TransactionService } from "./modules/transactions/transaction.service.js";
import { RealtimeGateway } from "./realtime/realtime.gateway.js";
import { RedisBackplane } from "./realtime/redis.backplane.js";
import { createAuthInterceptor } from "./rpc/auth.interceptor.js";
import { createErrorInterceptor, type ErrorLogger } from "./rpc/error.interceptor.js";
import { createRoutes } from "./rpc/routes.js";
import { ProcessingQueue } from "./shared/processing-queue.js";

const STATEMENT_CONCURRENCY = 2;
const WS_AUTH_TIMEOUT_MS = 5_000;
const WS_HEARTBEAT_MS = 30_000;

export function createContainer(env: Env, logUnexpected: ErrorLogger) {
  const prisma = createPrismaClient();
  const accessTokens = new JwtIssuer(env.JWT_ACCESS_SECRET, env.ACCESS_TOKEN_TTL_SECONDS);
  const realtime = new RealtimeGateway(
    new RedisBackplane(env.REDIS_URL, logUnexpected),
    accessTokens,
    {
      allowedOrigins: env.CORS_ORIGINS,
      authTimeoutMs: WS_AUTH_TIMEOUT_MS,
      heartbeatMs: WS_HEARTBEAT_MS,
    },
    logUnexpected,
  );

  const auth = new AuthService(
    new PrismaUserRepository(prisma),
    new PrismaRefreshTokenRepository(prisma),
    new Argon2Hasher(),
    accessTokens,
    env.REFRESH_TOKEN_TTL_DAYS,
  );
  const cookie = new RefreshCookie(env.NODE_ENV === "production", env.REFRESH_TOKEN_TTL_DAYS);
  const bankAccounts = new BankAccountService(new PrismaBankAccountRepository(prisma));

  const statementRepository = new PrismaStatementRepository(prisma);
  const processor = new StatementProcessor(
    statementRepository,
    new RemoteAnalyzer(
      new PrismaAnalysisRepository(prisma),
      new AnalysisEngineClient({
        baseUrl: env.AI_SERVICE_URL,
        transport: env.AI_TRANSPORT,
        internalKey: env.AI_INTERNAL_KEY,
        timeoutMs: env.AI_TIMEOUT_MS,
      }),
      realtime,
    ),
    realtime,
    logUnexpected,
  );
  const queue = new ProcessingQueue<StatementJob>(
    (job) => processor.process(job),
    STATEMENT_CONCURRENCY,
    logUnexpected,
  );
  const statements = new StatementService(statementRepository, realtime, (job) =>
    queue.enqueue(job),
  );
  const transactions = new TransactionService(new PrismaTransactionRepository(prisma), realtime);

  const interceptors: Interceptor[] = [
    createErrorInterceptor(logUnexpected),
    createAuthInterceptor(accessTokens),
  ];
  const routes = createRoutes({
    auth: createAuthHandlers(auth, cookie),
    bankAccounts: createBankAccountHandlers(bankAccounts),
    statements: createStatementHandlers(statements, transactions),
  });

  return {
    routes,
    interceptors,
    realtime,
    close: async () => {
      await queue.onIdle();
      await realtime.close();
      await prisma.$disconnect();
    },
  };
}
