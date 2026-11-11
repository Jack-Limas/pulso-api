import type { Redis } from "ioredis";

const KEY_PREFIX = "pulso:presence:";
const SCAN_BATCH = 100;

export interface PresenceSnapshot {
  instanceId: string;
  connections: number;
  userIds: string[];
}

/** Each instance reports its own connections; the snapshot expires if the instance dies. */
export interface PresenceStore {
  report(snapshot: PresenceSnapshot, ttlSeconds: number): Promise<void>;
  readAll(): Promise<PresenceSnapshot[]>;
}

export class RedisPresenceStore implements PresenceStore {
  constructor(private readonly redis: Redis) {}

  async report(snapshot: PresenceSnapshot, ttlSeconds: number): Promise<void> {
    await this.redis.set(
      `${KEY_PREFIX}${snapshot.instanceId}`,
      JSON.stringify(snapshot),
      "EX",
      ttlSeconds,
    );
  }

  async readAll(): Promise<PresenceSnapshot[]> {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await this.redis.scan(
        cursor,
        "MATCH",
        `${KEY_PREFIX}*`,
        "COUNT",
        SCAN_BATCH,
      );
      keys.push(...batch);
      cursor = next;
    } while (cursor !== "0");
    if (keys.length === 0) {
      return [];
    }
    const values = await this.redis.mget(keys);
    return values.flatMap((value) => (value ? [JSON.parse(value) as PresenceSnapshot] : []));
  }
}
