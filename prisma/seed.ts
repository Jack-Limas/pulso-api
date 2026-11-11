import { PrismaClient } from "@prisma/client";
import { Argon2Hasher } from "../src/modules/auth/argon2.hasher.js";

const CATEGORIES = [
  { code: "food", colorHex: "#FF2E4D" },
  { code: "transport", colorHex: "#1F4BFF" },
  { code: "housing", colorHex: "#7A3CFF" },
  { code: "entertainment", colorHex: "#FF7A00" },
  { code: "utilities", colorHex: "#00B8A9" },
  { code: "health", colorHex: "#00C853" },
  { code: "education", colorHex: "#FFD23F" },
  { code: "technology", colorHex: "#00A3FF" },
  { code: "shopping", colorHex: "#FF4FA3" },
  { code: "other", colorHex: "#8A8FA3" },
];

const BANKS = [
  { code: "banco-andino", name: "Banco Andino" },
  { code: "cooperativa-sur", name: "Cooperativa Sur" },
];

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { code: category.code },
      update: { colorHex: category.colorHex },
      create: { ...category, isDefault: true },
    });
  }
  for (const bank of BANKS) {
    await prisma.supportedBank.upsert({
      where: { code: bank.code },
      update: { name: bank.name },
      create: bank,
    });
  }
  const email = process.env["SEED_ADMIN_EMAIL"]?.toLowerCase();
  const password = process.env["SEED_ADMIN_PASSWORD"];
  if (!email || !password) {
    console.warn("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are not set; skipping the admin user");
    return;
  }
  const passwordHash = await new Argon2Hasher().hash(password);
  await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", passwordHash },
    create: { email, passwordHash, fullName: "Pulso Admin", role: "ADMIN" },
  });
}

await main().finally(() => prisma.$disconnect());
