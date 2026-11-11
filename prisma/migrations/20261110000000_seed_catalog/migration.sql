-- Reference data every environment needs; ON CONFLICT keeps it safe to re-run.
INSERT INTO "Category" ("id", "code", "colorHex", "isDefault") VALUES
  (gen_random_uuid(), 'food', '#FF2E4D', true),
  (gen_random_uuid(), 'transport', '#1F4BFF', true),
  (gen_random_uuid(), 'housing', '#7A3CFF', true),
  (gen_random_uuid(), 'entertainment', '#FF7A00', true),
  (gen_random_uuid(), 'utilities', '#00B8A9', true),
  (gen_random_uuid(), 'health', '#00C853', true),
  (gen_random_uuid(), 'education', '#FFD23F', true),
  (gen_random_uuid(), 'technology', '#00A3FF', true),
  (gen_random_uuid(), 'shopping', '#FF4FA3', true),
  (gen_random_uuid(), 'other', '#8A8FA3', true)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "SupportedBank" ("id", "code", "name", "isActive", "updatedAt") VALUES
  (gen_random_uuid(), 'banco-andino', 'Banco Andino', true, now()),
  (gen_random_uuid(), 'cooperativa-sur', 'Cooperativa Sur', true, now())
ON CONFLICT ("code") DO NOTHING;
