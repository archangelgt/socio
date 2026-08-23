export const PROVIDER_FAILURE_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "rate_limited",
  "validation_error",
  "unsupported",
  "transient",
  "unknown",
] as const;

export type ProviderFailureCode = (typeof PROVIDER_FAILURE_CODES)[number];

export class ChannelProviderError extends Error {
  readonly code: ProviderFailureCode;
  readonly status?: number;

  constructor(code: ProviderFailureCode, message: string, status?: number) {
    super(message);
    this.name = "ChannelProviderError";
    this.code = code;
    this.status = status;
  }
}

export function mapGraphError(
  status: number,
  graphCode: number | undefined,
  message: string,
): ChannelProviderError {
  if (status === 401 || graphCode === 190) {
    return new ChannelProviderError("unauthorized", message, status);
  }
  if (status === 403 || graphCode === 10 || graphCode === 200) {
    return new ChannelProviderError("forbidden", message, status);
  }
  if (status === 404 || graphCode === 803) {
    return new ChannelProviderError("not_found", message, status);
  }
  if (
    status === 429 ||
    graphCode === 4 ||
    graphCode === 17 ||
    graphCode === 32
  ) {
    return new ChannelProviderError("rate_limited", message, status);
  }
  if (status === 400 || graphCode === 100) {
    return new ChannelProviderError("validation_error", message, status);
  }
  if (status >= 500) {
    return new ChannelProviderError("transient", message, status);
  }
  return new ChannelProviderError("unknown", message, status);
}
