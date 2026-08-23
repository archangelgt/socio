export const QUEUE_INBOUND_EVENTS = "inbound-events";
export const QUEUE_MODERATION = "moderation";
export const QUEUE_OUTBOUND_ACTIONS = "outbound-actions";

export const ACTION_SOURCES = ["policy", "human"] as const;
export type ActionSource = (typeof ACTION_SOURCES)[number];
