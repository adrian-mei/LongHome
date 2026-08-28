import { resolve } from "node:path";

export type AiProvider = "anthropic" | "gemini" | "openai";

export interface LongHomeAiConfig {
  apiKey: string;
  model: string;
  provider: AiProvider;
  timeoutMs: number;
}

export interface LongHomeConfig {
  ai: LongHomeAiConfig | null;
  dataDir: string;
  host: string;
  maxPhotoBytes: number;
  maxVideoBytes: number;
  port: number;
  publicUrl: string | null;
  writeToken: string | null;
}

const megabyte = 1024 * 1024;

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function aiConfig(): LongHomeAiConfig | null {
  const rawProvider = process.env.LONGHOME_AI_PROVIDER?.trim().toLowerCase();
  if (!rawProvider) return null;
  if (!["anthropic", "gemini", "openai"].includes(rawProvider)) {
    throw new Error(
      "LONGHOME_AI_PROVIDER must be openai, anthropic, or gemini.",
    );
  }

  const apiKey = process.env.LONGHOME_AI_API_KEY?.trim();
  const model = process.env.LONGHOME_AI_MODEL?.trim();
  if (!apiKey || !model) {
    throw new Error(
      "LONGHOME_AI_API_KEY and LONGHOME_AI_MODEL are required when AI assistance is enabled.",
    );
  }

  return {
    apiKey,
    model,
    provider: rawProvider as AiProvider,
    timeoutMs: positiveInteger(process.env.LONGHOME_AI_TIMEOUT_MS, 60_000),
  };
}

export function loadConfig(
  overrides: Partial<LongHomeConfig> = {},
): LongHomeConfig {
  const writeToken = process.env.LONGHOME_WRITE_TOKEN?.trim() || null;

  return {
    ai: aiConfig(),
    dataDir: resolve(process.env.LONGHOME_DATA_DIR || "./data"),
    host: process.env.LONGHOME_HOST || "0.0.0.0",
    maxPhotoBytes:
      positiveInteger(process.env.LONGHOME_MAX_PHOTO_MB, 15) * megabyte,
    maxVideoBytes:
      positiveInteger(process.env.LONGHOME_MAX_VIDEO_MB, 250) * megabyte,
    port: positiveInteger(process.env.LONGHOME_PORT, 3000),
    publicUrl: process.env.LONGHOME_PUBLIC_URL?.replace(/\/$/, "") || null,
    writeToken,
    ...overrides,
  };
}
