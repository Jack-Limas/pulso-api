import { createContextKey, type HandlerContext } from "@connectrpc/connect";
import type { AuthenticatedUser } from "../modules/auth/auth.types.js";
import { AppError } from "../shared/errors.js";

export const currentUserKey = createContextKey<AuthenticatedUser | undefined>(undefined);

export function requireUser(context: HandlerContext): AuthenticatedUser {
  const user = context.values.get(currentUserKey);
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "Authentication required");
  }
  return user;
}
