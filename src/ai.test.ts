import { describe, expect, it, vi } from "vitest";
import { draftMemorialStory, StoryAssistantError } from "./ai.js";
import type { AiProvider, LongHomeAiConfig } from "./config.js";

const input = {
  birthDate: "1940-01-02",
  deathDate: "2020-03-04",
  length: "medium" as const,
  name: "Test Person",
  story: "They grew roses and taught their grandchildren to bake.",
  tone: "warm" as const,
};

function config(provider: AiProvider): LongHomeAiConfig {
  const local = provider === "claude-cli" || provider === "codex-cli";
  return {
    apiKey: local ? null : "provider-secret",
    model: local ? null : "test-model",
    provider,
    timeoutMs: 1_000,
  };
}

function mockFetch(responseBody: object) {
  return vi.fn(
    async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) =>
      new Response(JSON.stringify(responseBody), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
  );
}

describe("memorial story providers", () => {
  it("uses OpenAI Responses without provider-side response storage", async () => {
    const fetcher = mockFetch({
      output: [{ content: [{ text: "OpenAI draft", type: "output_text" }] }],
    });
    await expect(
      draftMemorialStory(config("openai"), input, fetcher as unknown as typeof fetch),
    ).resolves.toBe("OpenAI draft");

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer provider-secret",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.store).toBe(false);
    expect(body.model).toBe("test-model");
    expect(body.input).toContain("grew roses");
    expect(body.input).not.toContain("photo");
  });

  it("uses Anthropic Messages and reads only text blocks", async () => {
    const fetcher = mockFetch({
      content: [
        { text: "Claude draft", type: "text" },
        { id: "ignored", type: "tool_use" },
      ],
    });
    await expect(
      draftMemorialStory(
        config("anthropic"),
        input,
        fetcher as unknown as typeof fetch,
      ),
    ).resolves.toBe("Claude draft");

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("provider-secret");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(JSON.parse(String(init?.body)).max_tokens).toBe(900);
  });

  it("uses Gemini Interactions without provider-side interaction storage", async () => {
    const fetcher = mockFetch({
      steps: [
        { content: [{ text: "source", type: "text" }], type: "user_input" },
        {
          content: [{ text: "Gemini draft", type: "text" }],
          type: "model_output",
        },
      ],
    });
    await expect(
      draftMemorialStory(config("gemini"), input, fetcher as unknown as typeof fetch),
    ).resolves.toBe("Gemini draft");

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "provider-secret",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.store).toBe(false);
    expect(body.generation_config.max_output_tokens).toBe(900);
  });

  it("returns one sanitized error for upstream failures and malformed output", async () => {
    const fetcher = vi.fn(async () =>
      new Response("provider secret details", { status: 500 })) as unknown as typeof fetch;

    await expect(
      draftMemorialStory(config("openai"), input, fetcher),
    ).rejects.toEqual(new StoryAssistantError());
  });

  it("runs Codex ephemerally in a read-only empty workspace", async () => {
    const runner = vi.fn(
      async (
        _command: string,
        _args: string[],
        _prompt: string,
        _timeoutMs: number,
      ) => "Codex CLI draft",
    );
    await expect(
      draftMemorialStory(config("codex-cli"), input, fetch, runner),
    ).resolves.toBe("Codex CLI draft");

    const [command, args, prompt, timeoutMs] = runner.mock.calls[0]!;
    expect(command).toBe("codex");
    expect(args).toEqual(
      expect.arrayContaining([
        "exec",
        "--ephemeral",
        "--sandbox",
        "read-only",
        "--ignore-user-config",
        "--ignore-rules",
        "-",
      ]),
    );
    expect(args.join(" ")).not.toContain("grew roses");
    expect(prompt).toContain("grew roses");
    expect(timeoutMs).toBe(1_000);
  });

  it("runs Claude Code without tools or session persistence", async () => {
    const runner = vi.fn(
      async (
        _command: string,
        _args: string[],
        _prompt: string,
        _timeoutMs: number,
      ) => JSON.stringify({ result: "Claude Code draft", type: "result" }),
    );
    await expect(
      draftMemorialStory(config("claude-cli"), input, fetch, runner),
    ).resolves.toBe("Claude Code draft");

    const [command, args, prompt] = runner.mock.calls[0]!;
    expect(command).toBe("claude");
    expect(args).toEqual(
      expect.arrayContaining([
        "-p",
        "--no-session-persistence",
        "--safe-mode",
        "--no-chrome",
        "--tools",
        "",
        "--strict-mcp-config",
      ]),
    );
    expect(args.join(" ")).not.toContain("grew roses");
    expect(prompt).toContain("grew roses");
  });
});
