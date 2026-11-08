import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { ZodError } from "zod";
import { AppError, type ErrorKind } from "../shared/errors.js";

const CODE_BY_KIND: Record<ErrorKind, Code> = {
  INVALID_INPUT: Code.InvalidArgument,
  UNAUTHENTICATED: Code.Unauthenticated,
  FORBIDDEN: Code.PermissionDenied,
  NOT_FOUND: Code.NotFound,
  CONFLICT: Code.AlreadyExists,
};

export type ErrorLogger = (error: unknown) => void;

export function createErrorInterceptor(logUnexpected: ErrorLogger): Interceptor {
  return (next) => async (request) => {
    try {
      return await next(request);
    } catch (error) {
      if (error instanceof ConnectError) {
        throw error;
      }
      if (error instanceof AppError) {
        throw new ConnectError(error.message, CODE_BY_KIND[error.kind]);
      }
      if (error instanceof ZodError) {
        const fields = error.issues.map((issue) => issue.path.join(".")).join(", ");
        throw new ConnectError(`Invalid fields: ${fields}`, Code.InvalidArgument);
      }
      logUnexpected(error);
      throw new ConnectError("Internal server error", Code.Internal);
    }
  };
}
