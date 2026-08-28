import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Response } from "light-my-request";
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

function extract(body: string, pattern: RegExp): string {
  const match = body.match(pattern);
  expect(match, `Expected ${pattern} in response body`).not.toBeNull();
  return match![1]!;
}

function responseCookie(response: Response): string {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  expect(value).toBeTruthy();
  return value!.split(";", 1)[0]!;
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

    expect(created.statusCode).toBe(201);
    expect(created.body).toContain("Steward link");
    const memorialPath = extract(
      created.body,
      /href="(\/m\/mei-yingxuan-[^"]+)"/,
    );

    const page = await app.inject({
      method: "GET",
      url: memorialPath,
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
    expect(response.statusCode).toBe(201);
    expect(response.body).toContain("A Minimal Memorial");
  });

  it("keeps an unlisted memorial off the directory and out of search indexes", async () => {
    const app = await testApp();
    const multipart = multipartBody({
      name: "Quiet Link",
      visibility: "unlisted",
    });
    const created = await app.inject({
      headers: { "content-type": multipart.contentType },
      method: "POST",
      payload: multipart.body,
      url: "/memorials",
    });
    const memorialPath = extract(
      created.body,
      /href="(\/m\/quiet-link-[^"]+)"/,
    );

    const home = await app.inject({ method: "GET", url: "/" });
    expect(home.body).not.toContain("Quiet Link");

    const memorial = await app.inject({ method: "GET", url: memorialPath });
    expect(memorial.statusCode).toBe(200);
    expect(memorial.body).toContain('name="robots" content="noindex, nofollow"');
  });

  it("guards private pages and media with revocable invitations", async () => {
    const app = await testApp();
    const multipart = multipartBody({
      invitees: "Immediate family",
      name: "Private Person",
      visibility: "private",
    });
    const created = await app.inject({
      headers: { "content-type": multipart.contentType },
      method: "POST",
      payload: multipart.body,
      url: "/memorials",
    });
    expect(created.statusCode).toBe(201);
    const memorialPath = extract(
      created.body,
      /href="(\/m\/memorial-[^"]+)"/,
    );
    expect(memorialPath).not.toContain("private-person");
    const slug = memorialPath.replace("/m/", "");
    const firstInviteToken = extract(
      created.body,
      /\/invite\/([a-zA-Z0-9_-]+)/,
    );
    const stewardToken = extract(
      created.body,
      /\/steward\/([a-zA-Z0-9_-]+)/,
    );

    const denied = await app.inject({ method: "GET", url: memorialPath });
    expect(denied.statusCode).toBe(401);
    expect(denied.body).toContain("held for invited visitors");
    expect(denied.body).not.toContain("Private Person");

    const home = await app.inject({ method: "GET", url: "/" });
    expect(home.body).not.toContain("Private Person");

    const accepted = await app.inject({
      method: "GET",
      url: `/invite/${firstInviteToken}`,
    });
    expect(accepted.statusCode).toBe(303);
    const inviteCookie = responseCookie(accepted);

    const memorial = await app.inject({
      headers: { cookie: inviteCookie },
      method: "GET",
      url: memorialPath,
    });
    expect(memorial.statusCode).toBe(200);
    const mediaPath = extract(memorial.body, /src="(\/media\/[^"]+)"/);

    const deniedMedia = await app.inject({ method: "GET", url: mediaPath });
    expect(deniedMedia.statusCode).toBe(404);
    const allowedMedia = await app.inject({
      headers: { cookie: inviteCookie },
      method: "GET",
      url: mediaPath,
    });
    expect(allowedMedia.statusCode).toBe(200);
    expect(allowedMedia.headers["cache-control"]).toBe("no-store");

    const stewardAccepted = await app.inject({
      method: "GET",
      url: `/steward/${stewardToken}`,
    });
    expect(stewardAccepted.statusCode).toBe(303);
    const stewardCookie = responseCookie(stewardAccepted);

    const newInvite = await app.inject({
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: stewardCookie,
      },
      method: "POST",
      payload: "label=Test+invite",
      url: `/manage/${slug}/invites`,
    });
    expect(newInvite.statusCode).toBe(200);
    const newInviteToken = extract(
      newInvite.body,
      /\/invite\/([a-zA-Z0-9_-]+)/,
    );
    const newInviteId = extract(
      newInvite.body,
      /Test invite[\s\S]*?\/invites\/([^/"]+)\/revoke/,
    );

    const newInviteAccepted = await app.inject({
      method: "GET",
      url: `/invite/${newInviteToken}`,
    });
    const newInviteCookie = responseCookie(newInviteAccepted);

    const revoked = await app.inject({
      headers: { cookie: stewardCookie },
      method: "POST",
      url: `/manage/${slug}/invites/${newInviteId}/revoke`,
    });
    expect(revoked.statusCode).toBe(303);

    const deniedAfterRevoke = await app.inject({
      headers: { cookie: newInviteCookie },
      method: "GET",
      url: memorialPath,
    });
    expect(deniedAfterRevoke.statusCode).toBe(401);

    const madePublic = await app.inject({
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: stewardCookie,
      },
      method: "POST",
      payload: "visibility=public",
      url: `/manage/${slug}/visibility`,
    });
    expect(madePublic.statusCode).toBe(303);

    const publicHome = await app.inject({ method: "GET", url: "/" });
    expect(publicHome.body).toContain("Private Person");
    const publicMemorial = await app.inject({ method: "GET", url: memorialPath });
    expect(publicMemorial.statusCode).toBe(200);
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
