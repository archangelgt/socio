import {
  QUEUE_INBOUND_EVENTS,
  QUEUE_MODERATION,
  QUEUE_OUTBOUND_ACTIONS,
  QUEUE_PUBLISH_DESTINATIONS,
} from "@social-ai/domain";
import type { ServiceContext } from "./context";
import { processInboundEvent } from "./inbound";
import { processModeration } from "./moderate";
import { processOutboundAction } from "./outbound";
import { processPublishDestination } from "./publish";
import { InlineQueue, type JobHandlers } from "./queue";

export function createInlineRuntime(
  input: Omit<ServiceContext, "queue">,
  mode: "await" | "deferred" = "await",
): ServiceContext {
  const handlers: Partial<JobHandlers> = {};
  const queue = new InlineQueue(handlers, mode);
  const ctx: ServiceContext = { ...input, queue };
  handlers[QUEUE_INBOUND_EVENTS] = (id) => processInboundEvent(ctx, id);
  handlers[QUEUE_MODERATION] = (id) => processModeration(ctx, id);
  handlers[QUEUE_OUTBOUND_ACTIONS] = (id) => processOutboundAction(ctx, id);
  handlers[QUEUE_PUBLISH_DESTINATIONS] = (id) =>
    processPublishDestination(ctx, id);
  return ctx;
}
