import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";

const apps: FastifyInstance[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

async function testApp(writeToken: string | null = null) {
  const dataDir = await mkdtemp(join(tmpdir(), "longhome-test-"));
  directories.push(dataDir);
  const app = await createApp({ dataDir, writeToken });
  apps.push(app);
  return app;
}

function multipartBody(
  fields: Record<string, string>,
  includePhoto = true,
  includeVideo = false,
): { body: Buffer; contentType: string } {
  const boundary = "----longhome-test-boundary";
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  if (includePhoto) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="portrait.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      Buffer.from("\r\n"),
    );
  }
  if (includeVideo) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="videos"; filename="memory.mp4"\r\nContent-Type: video/mp4\r\n\r\n`,
      ),
      Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
      Buffer.from("\r\n"),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("LongHome", () => {
  it("serves its health endpoint", async () => {
    const app = await testApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("creates a memorial with a required photo and optional story", async () => {
    const app = await testApp();
    const multipart = multipartBody(
      {
        birthDate: "1944-01-02",
        deathDate: "2024-05-06",
        name: "Mei Yingxuan",
        story: "A life held by family.",
      },
      true,
      true,
    );
    const created = await app.inject({
      headers: { "content-type": multipart.contentType },
      method: "POST",
      payload: multipart.body,
      url: "/memorials",
    });

    expect(created.statusCode).toBe(303);
    expect(created.headers.location).toMatch(/^\/m\/mei-yingxuan-/);

    const page = await app.inject({
      method: "GET",
      url: created.headers.location!,
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Mei Yingxuan");
    expect(page.body).toContain("A life held by family.");
    expect(page.body).toContain("1944-01-02");
    expect(page.body).toContain("<video controls");
  });

  it("creates a memorial with only a name and photo", async () => {
    const app = await testApp();
    const multipart = multipartBody({ name: "A Minimal Memorial" });
    const response = await app.inject({
      headers: { "content-type": multipart.contentType },
      method: "POST",
      payload: multipart.body,
      url: "/memorials",
    });
    expect(response.statusCode).toBe(303);
  });

  it("rejects a memorial without a photo", async () => {
    const app = await testApp();
    const multipart = multipartBody({ name: "No Photo" }, false);
    const response = await app.inject({
      headers: { "content-type": multipart.contentType },
      method: "POST",
      payload: multipart.body,
      url: "/memorials",
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("Add at least one photo.");
  });

  it("protects publishing when a write token is configured", async () => {
    const app = await testApp("family-secret");
    const multipart = multipartBody({ name: "Protected Memorial" });
    const response = await app.inject({
      headers: { "content-type": multipart.contentType },
      method: "POST",
      payload: multipart.body,
      url: "/memorials",
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("publishing token is incorrect");
  });
});
