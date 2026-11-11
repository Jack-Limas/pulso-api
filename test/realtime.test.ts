import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { JwtIssuer } from "../src/modules/auth/jwt.issuer.js";
import type { Backplane, BackplaneListener } from "../src/realtime/backplane.js";
import type { PresenceSnapshot, PresenceStore } from "../src/realtime/presence.js";
import { RealtimeGateway } from "../src/realtime/realtime.gateway.js";

const ORIGIN = "https://pulso.test";
const accessTokens = new JwtIssuer("test-secret-with-at-least-32-characters", 900);

/** Stands in for Redis: it routes a message to whichever instances subscribed to the channel. */
class Hub {
  readonly nodes = new Set<HubNode>();

  route(channel: string, message: string): void {
    for (const node of this.nodes) {
      if (node.channels.has(channel)) {
        node.listener?.(channel, message);
      }
    }
  }
}

class HubNode implements Backplane {
  readonly channels = new Set<string>();
  listener?: BackplaneListener;

  constructor(private readonly hub: Hub) {
    hub.nodes.add(this);
  }

  async publish(channel: string, message: string): Promise<void> {
    this.hub.route(channel, message);
  }

  async subscribe(channel: string): Promise<void> {
    this.channels.add(channel);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.channels.delete(channel);
  }

  onMessage(listener: BackplaneListener): void {
    this.listener = listener;
  }

  async close(): Promise<void> {
    this.hub.nodes.delete(this);
  }
}

class MemoryPresence implements PresenceStore {
  readonly snapshots = new Map<string, PresenceSnapshot>();

  async report(snapshot: PresenceSnapshot): Promise<void> {
    this.snapshots.set(snapshot.instanceId, snapshot);
  }

  async readAll(): Promise<PresenceSnapshot[]> {
    return [...this.snapshots.values()];
  }
}

interface Instance {
  gateway: RealtimeGateway;
  node: HubNode;
  server: Server;
  url: string;
}

interface Client {
  socket: WebSocket;
  received: { type: string }[];
}

const ANNOUNCEMENT = { type: "announcement", title: "Gol", body: "Colombia" } as const;

describe("RealtimeGateway", () => {
  let hub: Hub;
  let presence: MemoryPresence;
  let instanceA: Instance;
  let instanceB: Instance;
  const clients: WebSocket[] = [];

  async function startInstance(authTimeoutMs = 2000): Promise<Instance> {
    const node = new HubNode(hub);
    const gateway = new RealtimeGateway(
      node,
      presence,
      accessTokens,
      {
        instanceId: `instance-${hub.nodes.size}`,
        allowedOrigins: [ORIGIN],
        authTimeoutMs,
        heartbeatMs: 60_000,
      },
      () => undefined,
    );
    const server = createServer();
    await gateway.start(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    return { gateway, node, server, url: `ws://127.0.0.1:${port}/ws` };
  }

  function open(url: string, origin = ORIGIN): WebSocket {
    const socket = new WebSocket(url, { origin });
    clients.push(socket);
    return socket;
  }

  async function connect(instance: Instance, userId: string): Promise<Client> {
    const token = await accessTokens.issue({ id: userId, role: "USER" });
    const socket = open(instance.url);
    const received: { type: string }[] = [];
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.once("open", () => socket.send(JSON.stringify({ type: "auth", token })));
      socket.on("message", (data) => {
        const message = JSON.parse(data.toString()) as { type: string };
        if (message.type === "ready") {
          resolve();
        } else {
          received.push(message);
        }
      });
    });
    return { socket, received };
  }

  const closeCode = (socket: WebSocket) =>
    new Promise<number>((resolve) => socket.once("close", resolve));
  const flush = () => new Promise((resolve) => setTimeout(resolve, 30));

  beforeEach(async () => {
    hub = new Hub();
    presence = new MemoryPresence();
    instanceA = await startInstance();
    instanceB = await startInstance();
  });

  afterEach(async () => {
    clients.splice(0).forEach((socket) => socket.terminate());
    for (const instance of [instanceA, instanceB]) {
      await instance.gateway.close();
      await new Promise((resolve) => instance.server.close(resolve));
    }
  });

  it("delivers an event published on another instance", async () => {
    const client = await connect(instanceA, "user-1");

    await instanceB.gateway.publishToUser("user-1", ANNOUNCEMENT);
    await flush();

    expect(client.received).toEqual([ANNOUNCEMENT]);
  });

  it("reaches every device of a user across instances", async () => {
    const laptop = await connect(instanceA, "user-1");
    const phone = await connect(instanceB, "user-1");

    await instanceA.gateway.publishToUser("user-1", ANNOUNCEMENT);
    await flush();

    expect(laptop.received).toHaveLength(1);
    expect(phone.received).toHaveLength(1);
  });

  it("does not leak events to other users", async () => {
    const other = await connect(instanceA, "user-2");

    await instanceB.gateway.publishToUser("user-1", ANNOUNCEMENT);
    await flush();

    expect(other.received).toHaveLength(0);
  });

  it("fans a broadcast out to all users on all instances", async () => {
    const users = await Promise.all([
      connect(instanceA, "user-1"),
      connect(instanceA, "user-2"),
      connect(instanceB, "user-3"),
    ]);

    await instanceA.gateway.broadcast(ANNOUNCEMENT);
    await flush();

    expect(users.map((user) => user.received.length)).toEqual([1, 1, 1]);
  });

  it("subscribes to a user channel only while that user is connected here", async () => {
    const channel = "pulso:user:user-1";
    const first = await connect(instanceA, "user-1");
    const second = await connect(instanceA, "user-1");
    expect(instanceA.node.channels.has(channel)).toBe(true);
    expect(instanceB.node.channels.has(channel)).toBe(false);

    first.socket.close();
    await flush();
    expect(instanceA.node.channels.has(channel)).toBe(true);

    second.socket.close();
    await flush();
    expect(instanceA.node.channels.has(channel)).toBe(false);
  });

  it("reports who is connected on each instance", async () => {
    await connect(instanceA, "user-1");
    await connect(instanceA, "user-1");
    await connect(instanceB, "user-2");
    await flush();

    const snapshots = await presence.readAll();

    expect(snapshots.map((s) => s.connections).sort()).toEqual([1, 2]);
    expect(snapshots.flatMap((s) => s.userIds).sort()).toEqual(["user-1", "user-2"]);
  });

  it("closes a connection with an invalid token", async () => {
    const socket = open(instanceA.url);
    const closed = closeCode(socket);
    socket.once("open", () => socket.send(JSON.stringify({ type: "auth", token: "forged" })));

    expect(await closed).toBe(4401);
  });

  it("closes a connection that never authenticates", async () => {
    const impatient = await startInstance(20);
    const socket = open(impatient.url);

    expect(await closeCode(socket)).toBe(4401);

    await impatient.gateway.close();
    await new Promise((resolve) => impatient.server.close(resolve));
  });

  it("rejects a connection from a foreign origin", async () => {
    const socket = open(instanceA.url, "https://evil.test");

    const status = await new Promise<number | undefined>((resolve) => {
      socket.once("unexpected-response", (_request, response) => resolve(response.statusCode));
      socket.once("error", () => resolve(undefined));
    });

    expect(status ?? 403).toBe(403);
  });
});
