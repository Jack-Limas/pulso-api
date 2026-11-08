import { jwtVerify, SignJWT } from "jose";
import { AppError } from "../../shared/errors.js";
import type { AccessTokenIssuer, AuthenticatedUser, UserRole } from "./auth.types.js";

const ISSUER = "pulso-api";
const ALGORITHM = "HS256";

export class JwtIssuer implements AccessTokenIssuer {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  issue(user: AuthenticatedUser): Promise<string> {
    return new SignJWT({ role: user.role })
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuer(ISSUER)
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.key);
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        algorithms: [ALGORITHM],
      });
      if (!payload.sub) {
        throw new Error("Token without subject");
      }
      return { id: payload.sub, role: payload["role"] as UserRole };
    } catch {
      throw new AppError("UNAUTHENTICATED", "Invalid or expired access token");
    }
  }
}
