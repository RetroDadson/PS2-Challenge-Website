import type { FastifyBaseLogger } from "fastify";

type HubName = "votes" | "games" | "subPicks" | "wheel";
type WebSocketLike = {
  OPEN: number;
  readyState: number;
  send(payload: string): void;
  on(event: "message", callback: (message: { toString(): string }) => void): void;
  on(event: "close", callback: () => void): void;
};

type RealtimeLogger = Pick<FastifyBaseLogger, "debug">;

export class RealtimeHub {
  private readonly sockets = new Map<HubName, Set<WebSocketLike>>([
    ["votes", new Set()],
    ["games", new Set()],
    ["subPicks", new Set()],
    ["wheel", new Set()]
  ]);
  private connectionSequence = 0;
  private logger: RealtimeLogger | undefined;

  constructor(logger?: RealtimeLogger) {
    this.logger = logger;
  }

  setLogger(logger: RealtimeLogger): void {
    this.logger = logger;
  }

  register(hub: HubName, socket: WebSocketLike): void {
    const connectionId = `${hub}-${++this.connectionSequence}`;
    const sockets = this.sockets.get(hub);
    if (!sockets) {
      return;
    }
    sockets.add(socket);
    this.logger?.debug({ hub, connectionId }, `${hubName(hub)} connection requested: ${connectionId}`);
    socket.on("message", (message) => {
      if (message.toString().toLocaleLowerCase("en-GB") === "ping") {
        this.logger?.debug({ hub, connectionId }, `${hubName(hub)} ping from: ${connectionId}`);
        socket.send(JSON.stringify({ type: "Pong" }));
      }
    });
    socket.on("close", () => sockets.delete(socket));
  }

  broadcastVotesUpdated(): void {
    this.broadcast("votes", "VotesUpdated");
  }

  broadcastGamesUpdated(): void {
    this.broadcast("games", "GamesUpdated");
  }

  broadcastSubPicksUpdated(): void {
    this.broadcast("subPicks", "SubPicksUpdated");
  }

  broadcastWheelUpdated(): void {
    this.broadcast("wheel", "WheelUpdated");
  }

  private broadcast(hub: HubName, eventName: string): void {
    const payload = JSON.stringify({ type: eventName });
    const sockets = this.sockets.get(hub);
    if (!sockets) {
      return;
    }
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }
}

const hubNames: Record<HubName, string> = { votes: "VotesHub", games: "GamesHub", subPicks: "SubPicksHub", wheel: "WheelHub" };

function hubName(hub: HubName): string {
  return hubNames[hub];
}
