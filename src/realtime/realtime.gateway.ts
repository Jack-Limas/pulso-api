import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { AccessTokenIssuer } from "../modules/auth/auth.types.js";
import type { Backplane } from "./backplane.js";
import { ConnectionRegistry } from "./connection-registry.js";
import type { EventPublisher, RealtimeEvent } from "./events.js";

const WS_PATH = "/ws";
const BROADCAST_CHANNEL = "pulso:broadcast";
const USER_CHANNEL_PREFIX = "pulso:user:";
const CLOSE_UNAUTHORIZED = 4401;
const MAX_INCOMING_BYTES = 16 * 1024;
const MAX_BUFFERED_BYTES = 1024 * 1024;

export interface GatewayOptions {
  allowedOrigins: string[];
  authTimeoutMs: number;
  heartbeatMs: number;
}

const userChannel = (userId: string) => `${USER_CHANNEL_PREFIX}${userId}`;

export class RealtimeGateway implements EventPublisher {
  private readonly registry = new ConnectionRegistry<WebSocket>();
  private readonly server = new WebSocketServer({ noServer: true, maxPayload: MAX_INCOMING_BYTES });
  private readonly alive = new WeakSet<WebSocket>();
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly backplane: Backplane,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly options: GatewayOptions,
    private readonly logError: (error: unknown) => void,
  ) {}

  async start(httpServer: Server): Promise<void> {
    this.backplane.onMessage((channel, message) => this.deliver(channel, message));
    await this.backplane.subscribe(BROADCAST_CHANNEL);
    httpServer.on("upgrade", (request, socket, head) => this.upgrade(request, socket, head));
    this.heartbeat = setInterval(() => this.checkHeartbeats(), this.options.heartbeatMs);
    this.heartbeat.unref();
  }

  async publishToUser(userId: string, event: RealtimeEvent): Promise<void> {
    await this.publish(userChannel(userId), event);
  }

  async broadcast(event: RealtimeEvent): Promise<void> {
    await this.publish(BROADCAST_CHANNEL, event);
  }

  async close(): Promise<void> {
    clearInterval(this.heartbeat);
    for (const socket of this.server.clients) {
      socket.terminate();
    }
    await new Promise((resolve) => this.server.close(resolve));
    await this.backplane.close();
  }

  // A lost notification must never fail the operation that produced it.
  private async publish(channel: string, event: RealtimeEvent): Promise<void> {
    try {
      await this.backplane.publish(channel, JSON.stringify(event));
    } catch (error) {
      this.logError(error);
    }
  }

  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    const origin = request.headers.origin;
    if (pathname !== WS_PATH || (origin && !this.options.allowedOrigins.includes(origin))) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    this.server.handleUpgrade(request, socket, head, (client) => this.awaitAuthentication(client));
  }

  // Browsers cannot set headers on a WebSocket, and a token in the URL would end up in logs.
  private awaitAuthentication(socket: WebSocket): void {
    const timeout = setTimeout(
      () => socket.close(CLOSE_UNAUTHORIZED, "Authentication timeout"),
      this.options.authTimeoutMs,
    );
    socket.on("error", this.logError);
    socket.once("close", () => clearTimeout(timeout));
    socket.once("message", (data) => {
      clearTimeout(timeout);
      this.authenticate(socket, data.toString()).catch(() => {
        socket.close(CLOSE_UNAUTHORIZED, "Invalid token");
      });
    });
  }

  private async authenticate(socket: WebSocket, rawMessage: string): Promise<void> {
    const { type, token } = JSON.parse(rawMessage) as { type?: string; token?: string };
    if (type !== "auth" || !token) {
      throw new Error("Expected an auth message");
    }
    const user = await this.accessTokens.verify(token);
    this.alive.add(socket);
    socket.on("pong", () => this.alive.add(socket));
    socket.once("close", () => void this.disconnect(user.id, socket));

    // Only channels with a local listener are subscribed, so instances skip unrelated traffic.
    if (this.registry.add(user.id, socket)) {
      await this.backplane.subscribe(userChannel(user.id));
    }
    socket.send(JSON.stringify({ type: "ready" }));
  }

  private async disconnect(userId: string, socket: WebSocket): Promise<void> {
    try {
      if (this.registry.remove(userId, socket)) {
        await this.backplane.unsubscribe(userChannel(userId));
      }
    } catch (error) {
      this.logError(error);
    }
  }

  private deliver(channel: string, message: string): void {
    const targets =
      channel === BROADCAST_CHANNEL
        ? this.registry.allSockets()
        : this.registry.socketsOf(channel.slice(USER_CHANNEL_PREFIX.length));
    for (const socket of targets) {
      this.send(socket, message);
    }
  }

  private send(socket: WebSocket, message: string): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    // A client that stopped reading would otherwise grow this buffer without limit.
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      socket.terminate();
      return;
    }
    socket.send(message);
  }

  private checkHeartbeats(): void {
    for (const socket of this.registry.allSockets()) {
      if (!this.alive.has(socket)) {
        socket.terminate();
        continue;
      }
      this.alive.delete(socket);
      socket.ping();
    }
  }
}
