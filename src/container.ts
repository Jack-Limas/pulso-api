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
import { createAuthInterceptor } from "./rpc/auth.interceptor.js";
import { createErrorInterceptor, type ErrorLogger } from "./rpc/error.interceptor.js";
import { createRoutes } from "./rpc/routes.js";

export function createContainer(env: Env, logUnexpected: ErrorLogger) {
  const prisma = createPrismaClient();
  const accessTokens = new JwtIssuer(env.JWT_ACCESS_SECRET, env.ACCESS_TOKEN_TTL_SECONDS);
  const auth = new AuthService(
    new PrismaUserRepository(prisma),
    new PrismaRefreshTokenRepository(prisma),
    new Argon2Hasher(),
    accessTokens,
    env.REFRESH_TOKEN_TTL_DAYS,
  );
  const cookie = new RefreshCookie(env.NODE_ENV === "production", env.REFRESH_TOKEN_TTL_DAYS);
  const bankAccounts = new BankAccountService(new PrismaBankAccountRepository(prisma));

  const interceptors: Interceptor[] = [
    createErrorInterceptor(logUnexpected),
    createAuthInterceptor(accessTokens),
  ];
  const routes = createRoutes({
    auth: createAuthHandlers(auth, cookie),
    bankAccounts: createBankAccountHandlers(bankAccounts),
  });

  return { routes, interceptors, close: () => prisma.$disconnect() };
}
