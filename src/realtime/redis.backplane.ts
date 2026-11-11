import type { Redis } from "ioredis";
import type { Backplane, BackplaneListener } from "./backplane.js";

export class RedisBackplane implements Backplane {
  // A Redis connection in subscriber mode cannot run other commands, so each role has its own.
  constructor(
    private readonly publisher: Redis,
    private readonly subscriber: Redis,
  ) {}

  async publish(channel: string, message: string): Promise<void> {
    await this.publisher.publish(channel, message);
  }

  async subscribe(channel: string): Promise<void> {
    await this.subscriber.subscribe(channel);
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  onMessage(listener: BackplaneListener): void {
    this.subscriber.on("message", listener);
  }

  async close(): Promise<void> {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
  }
}
