/** Tracks which sockets on this instance belong to each user; one user can have many devices. */
export class ConnectionRegistry<TSocket> {
  private readonly socketsByUser = new Map<string, Set<TSocket>>();

  /** Returns true when this is the user's first socket on this instance. */
  add(userId: string, socket: TSocket): boolean {
    const sockets = this.socketsByUser.get(userId);
    if (sockets) {
      sockets.add(socket);
      return false;
    }
    this.socketsByUser.set(userId, new Set([socket]));
    return true;
  }

  /** Returns true when the user has no sockets left on this instance. */
  remove(userId: string, socket: TSocket): boolean {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets?.delete(socket) || sockets.size > 0) {
      return false;
    }
    this.socketsByUser.delete(userId);
    return true;
  }

  socketsOf(userId: string): ReadonlySet<TSocket> {
    return this.socketsByUser.get(userId) ?? new Set();
  }

  *allSockets(): Iterable<TSocket> {
    for (const sockets of this.socketsByUser.values()) {
      yield* sockets;
    }
  }

  userIds(): string[] {
    return [...this.socketsByUser.keys()];
  }

  connectionCount(): number {
    let total = 0;
    for (const sockets of this.socketsByUser.values()) {
      total += sockets.size;
    }
    return total;
  }
}
