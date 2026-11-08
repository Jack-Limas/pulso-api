const COOKIE_NAME = "pulso_refresh";
const COOKIE_PATH = "/pulso.v1.AuthService";
const SECONDS_PER_DAY = 86_400;

export class RefreshCookie {
  constructor(
    private readonly secure: boolean,
    private readonly ttlDays: number,
  ) {}

  read(cookieHeader: string | null): string | undefined {
    const prefix = `${COOKIE_NAME}=`;
    return cookieHeader
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);
  }

  serialize(token: string): string {
    return this.build(token, this.ttlDays * SECONDS_PER_DAY);
  }

  clear(): string {
    return this.build("", 0);
  }

  private build(value: string, maxAge: number): string {
    const sameSite = this.secure ? "SameSite=None; Secure" : "SameSite=Lax";
    return `${COOKIE_NAME}=${value}; Path=${COOKIE_PATH}; HttpOnly; ${sameSite}; Max-Age=${maxAge}`;
  }
}
