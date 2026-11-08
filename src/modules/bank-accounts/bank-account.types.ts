export type AccountKind = "SAVINGS" | "CHECKING" | "DIGITAL_WALLET";

export interface BankRecord {
  id: string;
  code: string;
  name: string;
}

export interface BankAccountRecord {
  id: string;
  bank: BankRecord;
  alias: string;
  type: AccountKind;
  lastFourDigits: string | null;
}

export interface NewBankAccount {
  supportedBankId: string;
  alias: string;
  type: AccountKind;
  lastFourDigits?: string | undefined;
}

export interface BankAccountRepository {
  listActiveBanks(): Promise<BankRecord[]>;
  isActiveBank(id: string): Promise<boolean>;
  listByUser(userId: string): Promise<BankAccountRecord[]>;
  create(userId: string, account: NewBankAccount): Promise<BankAccountRecord>;
  deleteOwned(userId: string, id: string): Promise<boolean>;
}
