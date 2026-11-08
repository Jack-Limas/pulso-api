import { z } from "zod";

const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 128;

const email = z.email().transform((value) => value.toLowerCase());

export const registerSchema = z.object({
  email,
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  fullName: z.string().trim().min(2).max(120),
  locale: z.string().transform((value) => (value === "en" ? "en" : "es")),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

export type RegisterInput = z.input<typeof registerSchema>;
export type LoginInput = z.input<typeof loginSchema>;
