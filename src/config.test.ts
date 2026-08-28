import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.js";

afterEach(() => vi.unstubAllEnvs());

describe("AI configuration", () => {
  it("is disabled by default", () => {
    vi.stubEnv("LONGHOME_AI_PROVIDER", "");
    expect(loadConfig().ai).toBeNull();
  });

  it("loads a named hosted provider", () => {
    vi.stubEnv("LONGHOME_AI_PROVIDER", "anthropic");
    vi.stubEnv("LONGHOME_AI_API_KEY", "secret");
    vi.stubEnv("LONGHOME_AI_MODEL", "test-model");
    vi.stubEnv("LONGHOME_AI_TIMEOUT_MS", "45000");
    expect(loadConfig().ai).toEqual({
      apiKey: "secret",
      model: "test-model",
      provider: "anthropic",
      timeoutMs: 45_000,
    });
  });

  it("fails fast for incomplete provider configuration", () => {
    vi.stubEnv("LONGHOME_AI_PROVIDER", "gemini");
    vi.stubEnv("LONGHOME_AI_API_KEY", "");
    vi.stubEnv("LONGHOME_AI_MODEL", "test-model");
    expect(() => loadConfig()).toThrow("LONGHOME_AI_API_KEY");
  });

  it("uses a signed-in local CLI without an API key", () => {
    vi.stubEnv("LONGHOME_AI_PROVIDER", "codex-cli");
    vi.stubEnv("LONGHOME_AI_API_KEY", "");
    vi.stubEnv("LONGHOME_AI_MODEL", "");
    vi.stubEnv("LONGHOME_AI_TIMEOUT_MS", "");
    expect(loadConfig().ai).toEqual({
      apiKey: null,
      model: null,
      provider: "codex-cli",
      timeoutMs: 120_000,
    });
  });
});
