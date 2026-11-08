import type { Interceptor } from "@connectrpc/connect";
import type { AccessTokenIssuer } from "../modules/auth/auth.types.js";
import { AppError } from "../shared/errors.js";
import { currentUserKey } from "./request-context.js";

const PUBLIC_PROCEDURES = new Set([
  "pulso.v1.AuthService/Register",
  "pulso.v1.AuthService/Login",
  "pulso.v1.AuthService/RefreshSession",
  "pulso.v1.AuthService/Logout",
  "pulso.v1.BankAccountService/ListSupportedBanks",
]);
const ADMIN_SERVICE = "pulso.v1.AdminService";
const BEARER_PREFIX = "Bearer ";

export function createAuthInterceptor(accessTokens: AccessTokenIssuer): Interceptor {
  return (next) => async (request) => {
    if (PUBLIC_PROCEDURES.has(`${request.service.typeName}/${request.method.name}`)) {
      return next(request);
    }
    const header = request.header.get("authorization");
    if (!header?.startsWith(BEARER_PREFIX)) {
      throw new AppError("UNAUTHENTICATED", "Authentication required");
    }
    const user = await accessTokens.verify(header.slice(BEARER_PREFIX.length));
    if (request.service.typeName === ADMIN_SERVICE && user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Administrator role required");
    }
    request.contextValues.set(currentUserKey, user);
    return next(request);
  };
}
