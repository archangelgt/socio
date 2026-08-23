import {
  QUEUE_INBOUND_EVENTS,
  QUEUE_MODERATION,
  QUEUE_OUTBOUND_ACTIONS,
} from "@social-ai/domain";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.info(
    "[worker] Redis is not configured. The API processes moderation inline for local V1.",
    {
      queues: [QUEUE_INBOUND_EVENTS, QUEUE_MODERATION, QUEUE_OUTBOUND_ACTIONS],
    },
  );
} else {
  console.info(
    "[worker] Redis configured; BullMQ consumers land in the next slice.",
    {
      redisUrl,
    },
  );
}

setInterval(() => {
  /* keep process alive until BullMQ consumers land */
}, 60_000);
