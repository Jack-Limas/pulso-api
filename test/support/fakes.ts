import { randomUUID } from "node:crypto";
import type {
  NewUser,
  PasswordHasher,
  RefreshTokenRecord,
  RefreshTokenRepository,
  UserRecord,
  UserRepository,
} from "../../src/modules/auth/auth.types.js";
import type {
  BankAccountRecord,
  BankAccountRepository,
  BankRecord,
  NewBankAccount,
} from "../../src/modules/bank-accounts/bank-account.types.js";

export class FakeHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return `hashed:${password}`;
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return hash === `hashed:${password}`;
  }
}

export class InMemoryUsers implements UserRepository {
  readonly byId = new Map<string, UserRecord>();

  async findByEmail(email: string): Promise<UserRecord | null> {
    return [...this.byId.values()].find((user) => user.email === email) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async create(user: NewUser): Promise<UserRecord> {
    const record: UserRecord = { ...user, id: randomUUID(), role: "USER" };
    this.byId.set(record.id, record);
    return record;
  }
}

export class InMemoryRefreshTokens implements RefreshTokenRepository {
  readonly byHash = new Map<string, RefreshTokenRecord>();

  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    this.byHash.set(tokenHash, { id: randomUUID(), userId, expiresAt, revokedAt: null });
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.byHash.get(tokenHash) ?? null;
  }

  async revoke(id: string): Promise<void> {
    for (const token of this.byHash.values()) {
      if (token.id === id) {
        token.revokedAt = new Date();
      }
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const token of this.byHash.values()) {
      if (token.userId === userId && !token.revokedAt) {
        token.revokedAt = new Date();
      }
    }
  }

  activeCount(): number {
    return [...this.byHash.values()].filter((token) => !token.revokedAt).length;
  }
}

export class InMemoryBankAccounts implements BankAccountRepository {
  readonly banks: BankRecord[] = [{ id: randomUUID(), code: "banco-andino", name: "Banco Andino" }];
  private readonly accounts: (BankAccountRecord & { userId: string })[] = [];

  async listActiveBanks(): Promise<BankRecord[]> {
    return this.banks;
  }

  async isActiveBank(id: string): Promise<boolean> {
    return this.banks.some((bank) => bank.id === id);
  }

  async listByUser(userId: string): Promise<BankAccountRecord[]> {
    return this.accounts.filter((account) => account.userId === userId);
  }

  async create(userId: string, account: NewBankAccount): Promise<BankAccountRecord> {
    const bank = this.banks.find((candidate) => candidate.id === account.supportedBankId);
    if (!bank) {
      throw new Error("Unknown bank");
    }
    const record = {
      id: randomUUID(),
      userId,
      bank,
      alias: account.alias,
      type: account.type,
      lastFourDigits: account.lastFourDigits ?? null,
    };
    this.accounts.push(record);
    return record;
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    const index = this.accounts.findIndex((a) => a.id === id && a.userId === userId);
    if (index < 0) {
      return false;
    }
    this.accounts.splice(index, 1);
    return true;
  }
}
