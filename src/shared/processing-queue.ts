type Worker<T> = (job: T) => Promise<void>;
type ErrorHandler<T> = (error: unknown, job: T) => void;

/** FIFO queue that caps how many jobs run at once, so bursts of uploads cannot starve the API. */
export class ProcessingQueue<T> {
  private readonly pending: T[] = [];
  private head = 0;
  private running = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly worker: Worker<T>,
    private readonly concurrency: number,
    private readonly onError: ErrorHandler<T>,
  ) {}

  enqueue(job: T): void {
    this.pending.push(job);
    this.drain();
  }

  onIdle(): Promise<void> {
    if (this.isIdle()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private isIdle(): boolean {
    return this.running === 0 && this.head === this.pending.length;
  }

  private drain(): void {
    while (this.running < this.concurrency && this.head < this.pending.length) {
      const job = this.pending[this.head++] as T;
      this.compact();
      this.running++;
      void this.run(job);
    }
  }

  private async run(job: T): Promise<void> {
    try {
      await this.worker(job);
    } catch (error) {
      this.onError(error, job);
    } finally {
      this.running--;
      this.drain();
      if (this.isIdle()) {
        this.idleWaiters.splice(0).forEach((resolve) => resolve());
      }
    }
  }

  // Advancing an index keeps dequeue O(1); consumed slots are released once the queue empties.
  private compact(): void {
    if (this.head === this.pending.length) {
      this.pending.length = 0;
      this.head = 0;
    }
  }
}
