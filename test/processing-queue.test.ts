import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "../src/modules/statements/merchant.normalizer.js";
import { ProcessingQueue } from "../src/shared/processing-queue.js";

describe("ProcessingQueue", () => {
  it("runs jobs in arrival order and never exceeds the concurrency limit", async () => {
    const started: number[] = [];
    let running = 0;
    let peak = 0;
    const queue = new ProcessingQueue<number>(
      async (job) => {
        started.push(job);
        peak = Math.max(peak, ++running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
      },
      2,
      () => undefined,
    );

    [1, 2, 3, 4, 5].forEach((job) => queue.enqueue(job));
    await queue.onIdle();

    expect(started).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
  });

  it("keeps working after a job fails", async () => {
    const failures: number[] = [];
    const done: number[] = [];
    const queue = new ProcessingQueue<number>(
      async (job) => {
        if (job === 1) {
          throw new Error("boom");
        }
        done.push(job);
      },
      1,
      (_error, job) => failures.push(job),
    );

    queue.enqueue(1);
    queue.enqueue(2);
    await queue.onIdle();

    expect(failures).toEqual([1]);
    expect(done).toEqual([2]);
  });
});

describe("normalizeMerchant", () => {
  it.each([
    ["COMPRA POS 1234 STARBUCKS #45", "STARBUCKS"],
    ["Pago en Café Águila", "CAFE AGUILA"],
    ["NETFLIX.COM 8833", "NETFLIX COM"],
    ["TIENDA DE BARRIO LA ESQUINA", "TIENDA DE BARRIO"],
    ["12345 ###", "UNKNOWN"],
  ])("turns %s into %s", (description, expected) => {
    expect(normalizeMerchant(description)).toBe(expected);
  });
});
