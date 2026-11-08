import { z } from "zod";
import { AppError } from "../../shared/errors.js";
import type {
  BankAccountRecord,
  BankAccountRepository,
  BankRecord,
  NewBankAccount,
} from "./bank-account.types.js";

const newAccountSchema = z.object({
  supportedBankId: z.uuid(),
  alias: z.string().trim().min(1).max(60),
  type: z.enum(["SAVINGS", "CHECKING", "DIGITAL_WALLET"]),
  lastFourDigits: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});

export class BankAccountService {
  constructor(private readonly accounts: BankAccountRepository) {}

  listBanks(): Promise<BankRecord[]> {
    return this.accounts.listActiveBanks();
  }

  list(userId: string): Promise<BankAccountRecord[]> {
    return this.accounts.listByUser(userId);
  }

  async create(userId: string, input: NewBankAccount): Promise<BankAccountRecord> {
    const data = newAccountSchema.parse(input);
    if (!(await this.accounts.isActiveBank(data.supportedBankId))) {
      throw new AppError("NOT_FOUND", "Bank is not supported");
    }
    return this.accounts.create(userId, data);
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!(await this.accounts.deleteOwned(userId, z.uuid().parse(id)))) {
      throw new AppError("NOT_FOUND", "Bank account not found");
    }
  }
}
