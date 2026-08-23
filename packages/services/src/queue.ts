import type {
  QUEUE_INBOUND_EVENTS,
  QUEUE_MODERATION,
  QUEUE_OUTBOUND_ACTIONS,
} from "@social-ai/domain";

export type JobName =
  | typeof QUEUE_INBOUND_EVENTS
  | typeof QUEUE_MODERATION
  | typeof QUEUE_OUTBOUND_ACTIONS;

export type JobQueue = {
  add(name: JobName, data: { id: string }): Promise<void>;
};

export type JobHandlers = {
  [K in JobName]: (id: string) => Promise<void>;
};

export class InlineQueue implements JobQueue {
  constructor(
    private readonly handlers: Partial<JobHandlers>,
    private readonly mode: "await" | "deferred" = "await",
  ) {}

  async add(name: JobName, data: { id: string }): Promise<void> {
    const handler = this.handlers[name];
    if (!handler) {
      throw new Error(`No handler registered for ${name}`);
    }

    if (this.mode === "await") {
      await handler(data.id);
      return;
    }

    setImmediate(() => {
      void handler(data.id);
    });
  }
}
