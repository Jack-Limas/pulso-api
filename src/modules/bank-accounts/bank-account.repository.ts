import type { PrismaClient } from "@prisma/client";
import type {
  BankAccountRecord,
  BankAccountRepository,
  BankRecord,
  NewBankAccount,
} from "./bank-account.types.js";

const BANK_FIELDS = { id: true, code: true, name: true } as const;
const ACCOUNT_FIELDS = {
  id: true,
  alias: true,
  type: true,
  lastFourDigits: true,
  bank: { select: BANK_FIELDS },
} as const;

export class PrismaBankAccountRepository implements BankAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listActiveBanks(): Promise<BankRecord[]> {
    return this.prisma.supportedBank.findMany({
      where: { isActive: true },
      select: BANK_FIELDS,
      orderBy: { name: "asc" },
    });
  }

  async isActiveBank(id: string): Promise<boolean> {
    const count = await this.prisma.supportedBank.count({ where: { id, isActive: true } });
    return count > 0;
  }

  listByUser(userId: string): Promise<BankAccountRecord[]> {
    return this.prisma.bankAccount.findMany({
      where: { userId },
      select: ACCOUNT_FIELDS,
      orderBy: { createdAt: "asc" },
    });
  }

  create(userId: string, account: NewBankAccount): Promise<BankAccountRecord> {
    return this.prisma.bankAccount.create({
      data: { ...account, lastFourDigits: account.lastFourDigits ?? null, userId },
      select: ACCOUNT_FIELDS,
    });
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.bankAccount.deleteMany({ where: { id, userId } });
    return count > 0;
  }
}
