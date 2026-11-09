import { Redis } from "ioredis";
import type { Backplane, BackplaneListener } from "./backplane.js";

export class RedisBackplane implements Backplane {
  private readonly publisher: Redis;
  // A Redis connection in subscriber mode cannot run other commands, so each role has its own.
  private readonly subscriber: Redis;

  constructor(url: string, logError: (error: unknown) => void) {
    this.publisher = new Redis(url);
    this.subscriber = new Redis(url);
    this.publisher.on("error", logError);
    this.subscriber.on("error", logError);
  }

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
