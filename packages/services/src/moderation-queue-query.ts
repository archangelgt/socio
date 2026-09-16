import {
  QUEUE_STATES,
  type QueueState,
  SEVERITIES,
  type Severity,
} from "@social-ai/domain";

export const QUEUE_STATUS_BUCKETS = {
  review: ["PENDING", "REVIEW_REQUIRED"],
  hidden: ["AUTO_HIDDEN"],
  allowed: ["AUTO_ALLOWED", "APPROVED", "OVERRIDDEN"],
  failed: ["ACTION_FAILED"],
} as const satisfies Record<string, readonly QueueState[]>;

export type QueueStatusBucket = keyof typeof QUEUE_STATUS_BUCKETS;

export const QUEUE_SORT_FIELDS = [
  "createdAt",
  "severity",
  "confidence",
  "status",
  "author",
] as const;

export type QueueSortField = (typeof QUEUE_SORT_FIELDS)[number];

export type ModerationQueueQuery = {
  status?: string;
  severity?: string;
  q?: string;
  sort?: string;
  order?: string;
  page?: number;
  pageSize?: number;
  socialAccountId?: string;
  brandId?: string;
};

const SEVERITY_RANK: Record<Severity, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function resolveQueueStatuses(
  status?: string,
): QueueState[] | undefined {
  if (!status) {
    return undefined;
  }
  if (status in QUEUE_STATUS_BUCKETS) {
    return [...QUEUE_STATUS_BUCKETS[status as QueueStatusBucket]];
  }
  if ((QUEUE_STATES as readonly string[]).includes(status)) {
    return [status as QueueState];
  }
  return undefined;
}

export function resolveQueueSeverity(severity?: string): Severity | undefined {
  if (!severity) {
    return undefined;
  }
  if ((SEVERITIES as readonly string[]).includes(severity)) {
    return severity as Severity;
  }
  return undefined;
}

export function resolveQueueSort(sort?: string): QueueSortField {
  if (sort && (QUEUE_SORT_FIELDS as readonly string[]).includes(sort)) {
    return sort as QueueSortField;
  }
  return "createdAt";
}

export function resolveQueueOrder(order?: string): "asc" | "desc" {
  return order === "asc" ? "asc" : "desc";
}

export function resolveQueuePage(page?: number): number {
  if (!page || !Number.isFinite(page) || page < 1) {
    return 1;
  }
  return Math.floor(page);
}

export function resolveQueuePageSize(pageSize?: number): number {
  if (!pageSize || !Number.isFinite(pageSize)) {
    return 25;
  }
  return Math.min(100, Math.max(1, Math.floor(pageSize)));
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function severityRank(severity: string | null | undefined): number {
  if (!severity || !(severity in SEVERITY_RANK)) {
    return -1;
  }
  return SEVERITY_RANK[severity as Severity];
}
