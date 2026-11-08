import argon2 from "argon2";
import type { PasswordHasher } from "./auth.types.js";

export class Argon2Hasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
