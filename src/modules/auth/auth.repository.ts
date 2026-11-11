import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/errors.js";
import type {
  NewUser,
  RefreshTokenRecord,
  RefreshTokenRepository,
  UserRecord,
  UserRepository,
} from "./auth.types.js";

const UNIQUE_VIOLATION = "P2002";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(user: NewUser): Promise<UserRecord> {
    try {
      return await this.prisma.user.create({ data: user });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new AppError("CONFLICT", "Email is already registered");
      }
      throw error;
    }
  }
}

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async revoke(id: string, reason: "rotated" | "logout"): Promise<void> {
    const now = new Date();
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: now, rotatedAt: reason === "rotated" ? now : null },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
