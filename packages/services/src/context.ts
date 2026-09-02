import type { AIProvider } from "@social-ai/ai";
import type { Database } from "@social-ai/db";
import type { JobQueue } from "./queue";

export type MetaConfig = {
  appId: string;
  appSecret: string;
  verifyToken: string;
  redirectUri: string;
  graphVersion: string;
  /** Facebook Login for Business configuration ID (`config_id` on dialog/oauth). */
  loginConfigId?: string;
  fetchImpl?: typeof fetch;
};

export type ServiceContext = {
  db: Database;
  queue: JobQueue;
  tokenKey: string;
  ai: AIProvider;
  meta?: MetaConfig;
};
