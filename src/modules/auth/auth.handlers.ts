import type { HandlerContext, ServiceImpl } from "@connectrpc/connect";
import { type AuthService as AuthContract, Role } from "../../gen/pulso/v1/auth_service_pb.js";
import { requireUser } from "../../rpc/request-context.js";
import type { AuthService, AuthSession } from "./auth.service.js";
import type { UserRecord } from "./auth.types.js";
import type { RefreshCookie } from "./refresh-cookie.js";

function toProtoUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role === "ADMIN" ? Role.ADMIN : Role.USER,
    locale: user.locale,
  };
}

export function createAuthHandlers(
  auth: AuthService,
  cookie: RefreshCookie,
): ServiceImpl<typeof AuthContract> {
  const respond = (session: AuthSession, context: HandlerContext) => {
    context.responseHeader.append("set-cookie", cookie.serialize(session.refreshToken));
    return { user: toProtoUser(session.user), accessToken: session.accessToken };
  };
  const readToken = (context: HandlerContext) => cookie.read(context.requestHeader.get("cookie"));

  return {
    async register(request, context) {
      return respond(await auth.register(request), context);
    },
    async login(request, context) {
      return respond(await auth.login(request), context);
    },
    async refreshSession(_request, context) {
      const session = await auth.refresh(readToken(context));
      return { accessToken: respond(session, context).accessToken };
    },
    async logout(_request, context) {
      await auth.logout(readToken(context));
      context.responseHeader.append("set-cookie", cookie.clear());
      return {};
    },
    async getCurrentUser(_request, context) {
      return { user: toProtoUser(await auth.getUser(requireUser(context).id)) };
    },
  };
}
