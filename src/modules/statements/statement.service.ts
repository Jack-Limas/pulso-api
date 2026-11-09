import { z } from "zod";
import type { EventPublisher } from "../../realtime/events.js";
import { AppError } from "../../shared/errors.js";
import type { Page, PageWindow } from "../../shared/pagination.js";
import { normalizeMerchant } from "./merchant.normalizer.js";
import type { StatementRecord, StatementRepository } from "./statement.types.js";

const MAX_TRANSACTIONS = 5000;
const isoDate = z.iso.date();

const uploadSchema = z
  .object({
    bankAccountId: z.uuid(),
    fileName: z.string().trim().min(1).max(255),
    fileHash: z.string().regex(/^[a-f0-9]{64}$/),
    periodStart: isoDate,
    periodEnd: isoDate,
    openingBalanceCents: z.bigint(),
    closingBalanceCents: z.bigint(),
    transactions: z
      .array(
        z.object({
          occurredOn: isoDate,
          description: z.string().trim().min(1).max(500),
          type: z.enum(["INCOME", "EXPENSE"]),
          amountCents: z.bigint().positive(),
        }),
      )
      .min(1)
      .max(MAX_TRANSACTIONS),
    metrics: z.object({
      mode: z.enum(["MAIN_THREAD", "WEB_WORKER"]),
      uploadMs: z.number().int().nonnegative(),
      processingMs: z.number().int().nonnegative(),
      memoryBytes: z.bigint().nonnegative().optional(),
    }),
  })
  .refine((data) => data.periodStart <= data.periodEnd, { path: ["periodEnd"] })
  .refine(
    ({ periodStart, periodEnd, transactions }) =>
      transactions.every((t) => t.occurredOn >= periodStart && t.occurredOn <= periodEnd),
    { path: ["transactions"] },
  );

export type UploadStatementInput = z.input<typeof uploadSchema>;

export class StatementService {
  constructor(
    private readonly statements: StatementRepository,
    private readonly events: EventPublisher,
    private readonly enqueue: (job: { statementId: string; userId: string }) => void,
  ) {}

  async upload(userId: string, input: UploadStatementInput): Promise<StatementRecord> {
    const { transactions, ...data } = uploadSchema.parse(input);
    if (!(await this.statements.ownsAccount(userId, data.bankAccountId))) {
      throw new AppError("NOT_FOUND", "Bank account not found");
    }
    if (await this.statements.existsByHash(data.bankAccountId, data.fileHash)) {
      throw new AppError("CONFLICT", "This statement was already uploaded");
    }
    const statement = await this.statements.create({
      ...data,
      entries: transactions.map((t) => ({ ...t, merchant: normalizeMerchant(t.description) })),
    });
    await this.events.publishToUser(userId, {
      type: "statement.status",
      statementId: statement.id,
      status: statement.status,
    });
    this.enqueue({ statementId: statement.id, userId });
    return statement;
  }

  async get(userId: string, id: string): Promise<StatementRecord> {
    const statement = await this.statements.findOwned(userId, z.uuid().parse(id));
    if (!statement) {
      throw new AppError("NOT_FOUND", "Statement not found");
    }
    return statement;
  }

  list(
    userId: string,
    bankAccountId: string | undefined,
    window: PageWindow,
  ): Promise<Page<StatementRecord>> {
    return this.statements.listOwned(userId, bankAccountId, window);
  }
}
