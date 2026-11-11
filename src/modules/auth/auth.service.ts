import { AppError } from "../../shared/errors.js";
import { type LoginInput, loginSchema, type RegisterInput, registerSchema } from "./auth.schemas.js";
import type {
  AccessTokenIssuer,
  PasswordHasher,
  RefreshTokenRepository,
  UserRecord,
  UserRepository,
} from "./auth.types.js";
import { generateRefreshToken, hashRefreshToken } from "./refresh-token.js";

const MS_PER_DAY = 86_400_000;
const INVALID_CREDENTIALS = "Invalid email or password";
const INVALID_SESSION = "Invalid session";
// Two tabs refreshing at once present the same token twice within milliseconds.
const ROTATION_GRACE_MS = 10_000;

export interface AuthSession {
  user: UserRecord;
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private decoyHash?: Promise<string>;

  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly hasher: PasswordHasher,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly refreshTtlDays: number,
  ) {}

  async register(input: RegisterInput): Promise<AuthSession> {
    const data = registerSchema.parse(input);
    if (await this.users.findByEmail(data.email)) {
      throw new AppError("CONFLICT", "Email is already registered");
    }
    const { password, ...profile } = data;
    const user = await this.users.create({
      ...profile,
      passwordHash: await this.hasher.hash(password),
    });
    return this.openSession(user);
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const { email, password } = loginSchema.parse(input);
    const user = await this.users.findByEmail(email);
    if (!user) {
      // Same work as a real check, so response time does not reveal which emails exist.
      await this.hasher.verify(await this.getDecoyHash(), password);
      throw new AppError("UNAUTHENTICATED", INVALID_CREDENTIALS);
    }
    if (!(await this.hasher.verify(user.passwordHash, password))) {
      throw new AppError("UNAUTHENTICATED", INVALID_CREDENTIALS);
    }
    return this.openSession(user);
  }

  async refresh(refreshToken: string | undefined): Promise<AuthSession> {
    if (!refreshToken) {
      throw new AppError("UNAUTHENTICATED", INVALID_SESSION);
    }
    const stored = await this.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (!stored) {
      throw new AppError("UNAUTHENTICATED", INVALID_SESSION);
    }
    const sinceRevoked = stored.revokedAt ? Date.now() - stored.revokedAt.getTime() : undefined;
    if (sinceRevoked !== undefined && sinceRevoked > ROTATION_GRACE_MS) {
      // A rotated token came back long after: it was stolen or replayed, so end every session.
      await this.refreshTokens.revokeAllForUser(stored.userId);
      throw new AppError("UNAUTHENTICATED", INVALID_SESSION);
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new AppError("UNAUTHENTICATED", INVALID_SESSION);
    }
    const user = await this.users.findById(stored.userId);
    if (!user) {
      throw new AppError("UNAUTHENTICATED", INVALID_SESSION);
    }
    if (!stored.revokedAt) {
      await this.refreshTokens.revoke(stored.id);
    }
    return this.openSession(user);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    const stored = await this.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (stored && !stored.revokedAt) {
      await this.refreshTokens.revoke(stored.id);
    }
  }

  async getUser(id: string): Promise<UserRecord> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new AppError("UNAUTHENTICATED", INVALID_SESSION);
    }
    return user;
  }

  private async openSession(user: UserRecord): Promise<AuthSession> {
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * MS_PER_DAY);
    await this.refreshTokens.create(user.id, hashRefreshToken(refreshToken), expiresAt);
    const accessToken = await this.accessTokens.issue({ id: user.id, role: user.role });
    return { user, accessToken, refreshToken };
  }

  private getDecoyHash(): Promise<string> {
    this.decoyHash ??= this.hasher.hash(generateRefreshToken());
    return this.decoyHash;
  }
}
