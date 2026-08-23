import {
  type ChannelAdapter,
  MetaChannelAdapter,
  MockChannelAdapter,
  isMetaProvider,
} from "@social-ai/channels";
import type { MetaConfig } from "./context";
import { AppError } from "./errors";

const mockAdapter = new MockChannelAdapter();

export function getChannelAdapter(
  provider: string,
  meta?: MetaConfig,
): ChannelAdapter {
  if (provider === "mock") {
    return mockAdapter;
  }

  if (isMetaProvider(provider)) {
    if (!meta?.appSecret || !meta.verifyToken) {
      throw new AppError(
        501,
        "META_NOT_CONFIGURED",
        "Set META_APP_ID, META_APP_SECRET, and META_VERIFY_TOKEN to connect Meta.",
      );
    }
    return new MetaChannelAdapter({
      appSecret: meta.appSecret,
      verifyToken: meta.verifyToken,
      graphVersion: meta.graphVersion,
      fetchImpl: meta.fetchImpl,
    });
  }

  throw new AppError(
    400,
    "UNSUPPORTED_PROVIDER",
    `Provider "${provider}" is not wired. Use mock or meta.`,
  );
}
