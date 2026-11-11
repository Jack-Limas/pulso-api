import { Code, ConnectError } from "@connectrpc/connect";
import { beforeEach, describe, expect, it } from "vitest";
import { bearer, createHarness, VALID_USER } from "./support/harness.js";

type Harness = ReturnType<typeof createHarness>;

async function expectCode(call: Promise<unknown>, code: Code): Promise<void> {
  const error = await call.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ConnectError);
  expect((error as ConnectError).code).toBe(code);
}

function cookieFrom(headers: Headers): string {
  return (headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

describe("AuthService", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  async function registerAndCaptureCookie() {
    let cookie = "";
    const session = await harness.authClient.register(VALID_USER, {
      onHeader: (headers) => {
        cookie = cookieFrom(headers);
      },
    });
    return { session, cookie };
  }

  it("registers with a normalized email and never exposes the password", async () => {
    const { session } = await registerAndCaptureCookie();

    expect(session.user?.email).toBe("ana@example.com");
    expect(session.accessToken).not.toBe("");
    expect(JSON.stringify(session.user)).not.toContain(VALID_USER.password);
  });

  it("rejects a duplicate email", async () => {
    await registerAndCaptureCookie();

    await expectCode(harness.authClient.register(VALID_USER), Code.AlreadyExists);
  });

  it("rejects a short password", async () => {
    await expectCode(
      harness.authClient.register({ ...VALID_USER, password: "short" }),
      Code.InvalidArgument,
    );
  });

  it("logs in with valid credentials", async () => {
    await registerAndCaptureCookie();

    const session = await harness.authClient.login(VALID_USER);

    expect(session.accessToken).not.toBe("");
  });

  it.each([
    ["wrong password", { email: VALID_USER.email, password: "not-the-password" }],
    ["unknown email", { email: "nobody@example.com", password: VALID_USER.password }],
  ])("rejects %s without revealing which one failed", async (_case, credentials) => {
    await registerAndCaptureCookie();

    await expectCode(harness.authClient.login(credentials), Code.Unauthenticated);
  });

  it("requires a token for private procedures", async () => {
    await expectCode(harness.authClient.getCurrentUser({}), Code.Unauthenticated);
  });

  it("rejects a tampered token", async () => {
    const { session } = await registerAndCaptureCookie();

    await expectCode(
      harness.authClient.getCurrentUser({}, bearer(`${session.accessToken}x`)),
      Code.Unauthenticated,
    );
  });

  it("returns the current user with a valid token", async () => {
    const { session } = await registerAndCaptureCookie();

    const response = await harness.authClient.getCurrentUser({}, bearer(session.accessToken));

    expect(response.user?.id).toBe(session.user?.id);
  });

  it("rotates the refresh token", async () => {
    const { cookie } = await registerAndCaptureCookie();

    const refreshed = await harness.authClient.refreshSession({}, { headers: { cookie } });

    expect(refreshed.accessToken).not.toBe("");
    expect(harness.refreshTokens.activeCount()).toBe(1);
  });

  it("accepts the same token twice within the grace period", async () => {
    const { cookie } = await registerAndCaptureCookie();
    await harness.authClient.refreshSession({}, { headers: { cookie } });

    const second = await harness.authClient.refreshSession({}, { headers: { cookie } });

    expect(second.accessToken).not.toBe("");
  });

  it("ends every session when a rotated token is replayed later", async () => {
    const { cookie } = await registerAndCaptureCookie();
    await harness.authClient.refreshSession({}, { headers: { cookie } });
    for (const token of harness.refreshTokens.byHash.values()) {
      if (token.rotatedAt) {
        token.rotatedAt = new Date(Date.now() - 60_000);
      }
    }

    await expectCode(
      harness.authClient.refreshSession({}, { headers: { cookie } }),
      Code.Unauthenticated,
    );
    expect(harness.refreshTokens.activeCount()).toBe(0);
  });

  it("revokes the session on logout", async () => {
    const { cookie } = await registerAndCaptureCookie();

    await harness.authClient.logout({}, { headers: { cookie } });

    await expectCode(
      harness.authClient.refreshSession({}, { headers: { cookie } }),
      Code.Unauthenticated,
    );
  });

  it("stores only a hash of the refresh token", async () => {
    const { cookie } = await registerAndCaptureCookie();
    const rawToken = cookie.split("=")[1] ?? "";

    expect(rawToken).not.toBe("");
    expect(harness.refreshTokens.byHash.has(rawToken)).toBe(false);
  });
});
