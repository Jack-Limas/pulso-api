import { Code, type ConnectError } from "@connectrpc/connect";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountType } from "../src/gen/pulso/v1/bank_account_service_pb.js";
import { bearer, createHarness, VALID_USER } from "./support/harness.js";

async function codeOf(call: Promise<unknown>): Promise<Code | undefined> {
  return call.then(
    () => undefined,
    (reason: unknown) => (reason as ConnectError).code,
  );
}

describe("BankAccountService", () => {
  let harness: ReturnType<typeof createHarness>;
  let token: ReturnType<typeof bearer>;
  let bankId: string;

  const signUp = async (email: string) => {
    const session = await harness.authClient.register({ ...VALID_USER, email });
    return bearer(session.accessToken);
  };

  beforeEach(async () => {
    harness = createHarness();
    token = await signUp("owner@example.com");
    bankId = harness.bankAccountsRepository.banks[0]!.id;
  });

  const create = (headers = token) =>
    harness.bankAccountClient.createBankAccount(
      { supportedBankId: bankId, alias: "Ahorros", type: AccountType.SAVINGS },
      headers,
    );

  it("lists supported banks without authentication", async () => {
    const response = await harness.bankAccountClient.listSupportedBanks({});

    expect(response.banks).toHaveLength(1);
  });

  it("lets one user hold accounts in the same bank", async () => {
    await create();
    await create();

    const response = await harness.bankAccountClient.listBankAccounts({}, token);

    expect(response.accounts).toHaveLength(2);
    expect(response.accounts[0]?.type).toBe(AccountType.SAVINGS);
  });

  it("requires an account type", async () => {
    const call = harness.bankAccountClient.createBankAccount(
      { supportedBankId: bankId, alias: "Ahorros" },
      token,
    );

    expect(await codeOf(call)).toBe(Code.InvalidArgument);
  });

  it("rejects an unsupported bank", async () => {
    const call = harness.bankAccountClient.createBankAccount(
      { supportedBankId: randomUUID(), alias: "Ahorros", type: AccountType.SAVINGS },
      token,
    );

    expect(await codeOf(call)).toBe(Code.NotFound);
  });

  it("isolates accounts between users", async () => {
    const { account } = await create();
    const intruder = await signUp("intruder@example.com");

    const list = await harness.bankAccountClient.listBankAccounts({}, intruder);
    const deletion = harness.bankAccountClient.deleteBankAccount({ id: account!.id }, intruder);

    expect(list.accounts).toHaveLength(0);
    expect(await codeOf(deletion)).toBe(Code.NotFound);
  });

  it("deletes an owned account", async () => {
    const { account } = await create();

    await harness.bankAccountClient.deleteBankAccount({ id: account!.id }, token);

    const list = await harness.bankAccountClient.listBankAccounts({}, token);
    expect(list.accounts).toHaveLength(0);
  });
});
