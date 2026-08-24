import { Client } from "pg";

import {
  GENERATION_EVENT_CHANNEL,
  parseGenerationEvent,
  type GenerationUpdatedEvent,
} from "@/shared/generation-events/generation-event-contract";

export type GenerationEventBrokerState =
  | "connecting"
  | "connected"
  | "degraded";

export type GenerationEventSubscriber = {
  onEvent: (event: GenerationUpdatedEvent) => void;
  onState?: (state: GenerationEventBrokerState) => void;
};

type Notification = { channel: string; payload?: string };

export type GenerationEventListenerClient = {
  connect: () => Promise<void>;
  query: (query: string) => Promise<unknown>;
  end: () => Promise<void>;
  on(event: "notification", listener: (message: Notification) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  removeAllListeners: () => unknown;
};

type Timer = ReturnType<typeof setTimeout>;

type BrokerOptions = {
  createClient?: () => GenerationEventListenerClient;
  setTimer?: (callback: () => void, delay: number) => Timer;
  clearTimer?: (timer: Timer) => void;
  random?: () => number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
};

const DEFAULT_RECONNECT_BASE_MS = 1_000;
const DEFAULT_RECONNECT_MAX_MS = 30_000;

function createPostgresClient(): GenerationEventListenerClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  return new Client({ connectionString });
}

export class GenerationEventBroker {
  private readonly subscribers = new Map<
    string,
    Set<GenerationEventSubscriber>
  >();
  private readonly createClient: () => GenerationEventListenerClient;
  private readonly setTimer: (callback: () => void, delay: number) => Timer;
  private readonly clearTimer: (timer: Timer) => void;
  private readonly random: () => number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private client: GenerationEventListenerClient | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: Timer | null = null;
  private reconnectAttempt = 0;
  private state: GenerationEventBrokerState = "connecting";

  constructor(options: BrokerOptions = {}) {
    this.createClient = options.createClient ?? createPostgresClient;
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
    this.random = options.random ?? Math.random;
    this.reconnectBaseMs =
      options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
    this.reconnectMaxMs = options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
  }

  subscribe(graphId: string, subscriber: GenerationEventSubscriber) {
    const graphSubscribers = this.subscribers.get(graphId) ?? new Set();
    graphSubscribers.add(subscriber);
    this.subscribers.set(graphId, graphSubscribers);
    subscriber.onState?.(this.state);
    void this.ensureConnected();

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.subscribers.get(graphId);
      current?.delete(subscriber);
      if (current?.size === 0) this.subscribers.delete(graphId);
      if (this.subscriberCount === 0) this.stop();
    };
  }

  private get subscriberCount() {
    let count = 0;
    for (const subscribers of this.subscribers.values()) {
      count += subscribers.size;
    }
    return count;
  }

  private setState(state: GenerationEventBrokerState) {
    if (this.state === state) return;
    this.state = state;
    for (const subscribers of this.subscribers.values()) {
      for (const subscriber of subscribers) subscriber.onState?.(state);
    }
  }

  private async ensureConnected() {
    if (
      this.subscriberCount === 0 ||
      this.client ||
      this.connectPromise ||
      this.reconnectTimer
    ) {
      return;
    }

    this.setState("connecting");
    const connectPromise = this.connect();
    this.connectPromise = connectPromise;
    try {
      await connectPromise;
    } finally {
      if (this.connectPromise === connectPromise) this.connectPromise = null;
    }
  }

  private async connect() {
    let client: GenerationEventListenerClient;
    try {
      client = this.createClient();
    } catch {
      this.degradeAndReconnect();
      return;
    }

    client.on("notification", (message) => this.onNotification(message));
    client.on("error", () => this.onConnectionLost(client));
    client.on("end", () => this.onConnectionLost(client));

    try {
      await client.connect();
      await client.query(`LISTEN ${GENERATION_EVENT_CHANNEL}`);
      if (this.subscriberCount === 0) {
        this.closeClient(client);
        return;
      }
      this.client = client;
      this.reconnectAttempt = 0;
      this.setState("connected");
    } catch {
      this.closeClient(client);
      this.degradeAndReconnect();
    }
  }

  private onNotification(message: Notification) {
    if (
      message.channel !== GENERATION_EVENT_CHANNEL ||
      typeof message.payload !== "string"
    ) {
      return;
    }
    const event = parseGenerationEvent(message.payload);
    if (!event) return;
    const subscribers = this.subscribers.get(event.graphId);
    if (!subscribers) return;
    for (const subscriber of subscribers) subscriber.onEvent(event);
  }

  private onConnectionLost(client: GenerationEventListenerClient) {
    if (this.client !== client) return;
    this.client = null;
    this.closeClient(client);
    this.degradeAndReconnect();
  }

  private degradeAndReconnect() {
    if (this.subscriberCount === 0) return;
    this.setState("degraded");
    if (this.reconnectTimer) return;
    const exponential = Math.min(
      this.reconnectMaxMs,
      this.reconnectBaseMs * 2 ** this.reconnectAttempt,
    );
    const jittered = Math.max(1, Math.round(exponential * (0.75 + this.random() * 0.5)));
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      void this.ensureConnected();
    }, jittered);
  }

  private closeClient(client: GenerationEventListenerClient) {
    client.removeAllListeners();
    void client.end().catch(() => undefined);
  }

  private stop() {
    if (this.reconnectTimer) {
      this.clearTimer(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    const client = this.client;
    this.client = null;
    if (client) this.closeClient(client);
    this.state = "connecting";
  }
}

type BrokerGlobal = typeof globalThis & {
  __generationEventBroker?: GenerationEventBroker;
};

export function getGenerationEventBroker() {
  const globalForBroker = globalThis as BrokerGlobal;
  globalForBroker.__generationEventBroker ??= new GenerationEventBroker();
  return globalForBroker.__generationEventBroker;
}
