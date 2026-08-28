import { resolve } from "node:path";

export interface LongHomeConfig {
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

export function loadConfig(
  overrides: Partial<LongHomeConfig> = {},
): LongHomeConfig {
  const writeToken = process.env.LONGHOME_WRITE_TOKEN?.trim() || null;

  return {
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
