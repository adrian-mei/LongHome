import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fastifyView from "@fastify/view";
import ejs from "ejs";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { timingSafeEqual, randomBytes, randomUUID } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  absoluteUrl,
  createAccessToken,
  hashAccessToken,
  inviteCookieName,
  stewardCookieName,
} from "./access.js";
import {
  aiProviderLabel,
  draftMemorialStory,
  type StoryDraftInput,
  type StoryLength,
  type StoryTone,
} from "./ai.js";
import { loadConfig, type LongHomeConfig } from "./config.js";
import { createStore } from "./store.js";
import type {
  MediaKind,
  Memorial,
  MemorialMedia,
  NewMemorialInvite,
  Visibility,
} from "./types.js";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const photoTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);
const videoTypes = new Map([
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"],
]);
const visibilityValues = new Set<Visibility>(["public", "unlisted", "private"]);
const storyLengths = new Set<StoryLength>(["short", "medium", "long"]);
const storyTones = new Set<StoryTone>(["warm", "factual", "celebratory"]);

class UploadError extends Error {}

interface FormValues {
  birthDate: string;
  deathDate: string;
  invitees: string;
  name: string;
  story: string;
  storyAiAssisted: string;
  visibility: string;
}

interface AppDependencies {
  draftStory?: typeof draftMemorialStory;
}

interface CreatedInvite {
  id: string;
  label: string;
  token: string;
}

function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "memorial"}-${randomBytes(3).toString("hex")}`;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function tokenMatches(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function mediaUrl(mediaId: string): string {
  return `/media/${encodeURIComponent(mediaId)}`;
}

function bytesToLabel(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function isVisibility(value: string): value is Visibility {
  return visibilityValues.has(value as Visibility);
}

function isStoryLength(value: string): value is StoryLength {
  return storyLengths.has(value as StoryLength);
}

function isStoryTone(value: string): value is StoryTone {
  return storyTones.has(value as StoryTone);
}

function validateFields(values: FormValues): string | null {
  if (!values.name.trim()) return "A name is required.";
  if (values.name.trim().length > 120) return "Name must be 120 characters or less.";
  if (values.story.length > 20_000) return "Story must be 20,000 characters or less.";
  if (values.birthDate && !isIsoDate(values.birthDate)) return "Birth date is invalid.";
  if (values.deathDate && !isIsoDate(values.deathDate)) return "End date is invalid.";
  if (!isVisibility(values.visibility)) return "Choose a valid privacy setting.";
  if (
    values.birthDate &&
    values.deathDate &&
    values.birthDate > values.deathDate
  ) {
    return "Birth date must be before the end date.";
  }
  return null;
}

function inviteLabels(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((label) => label.trim()).filter(Boolean))];
}

function formBody(request: FastifyRequest): Record<string, string> {
  const body = request.body as Record<string, unknown> | null | undefined;
  if (!body) return {};
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, String(value ?? "")]),
  );
}

async function saveUpload(
  stream: NodeJS.ReadableStream,
  destination: string,
  byteLimit: number,
): Promise<void> {
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > byteLimit) {
        callback(new UploadError(`File exceeds ${bytesToLabel(byteLimit)}.`));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(stream, limiter, createWriteStream(destination, { flags: "wx" }));
}

export async function createApp(
  overrides: Partial<LongHomeConfig> = {},
  dependencies: AppDependencies = {},
): Promise<FastifyInstance> {
  const config = loadConfig(overrides);
  const draftStory = dependencies.draftStory || draftMemorialStory;
  const store = createStore(config.dataDir);
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    trustProxy: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        "media-src": ["'self'", "blob:"],
      },
    },
  });
  await app.register(cookie);
  await app.register(formbody);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: {
      fields: 10,
      fileSize: Math.max(config.maxPhotoBytes, config.maxVideoBytes),
      files: 16,
      parts: 26,
    },
  });
  await app.register(fastifyView, {
    engine: { ejs },
    root: join(sourceDir, "views"),
  });
  await app.register(fastifyStatic, {
    prefix: "/assets/",
    root: join(sourceDir, "public"),
  });

  app.addHook("onClose", async () => store.close());

  const noStore = (reply: FastifyReply) =>
    reply
      .header("Cache-Control", "no-store")
      .header("X-Robots-Tag", "noindex, nofollow");

  const requestBaseUrl = (request: FastifyRequest) =>
    config.publicUrl ||
    `${request.protocol}://${request.headers.host || `127.0.0.1:${config.port}`}`;

  const setAccessCookie = (
    request: FastifyRequest,
    reply: FastifyReply,
    name: string,
    token: string,
  ) => {
    reply.setCookie(name, token, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "strict",
      secure: request.protocol === "https",
    });
  };

  const hasStewardAccess = (request: FastifyRequest, memorial: Memorial) => {
    const token = request.cookies[stewardCookieName(memorial.id)];
    return token
      ? store.isStewardValid(memorial.id, hashAccessToken(token))
      : false;
  };

  const hasMemorialAccess = (request: FastifyRequest, memorial: Memorial) => {
    if (memorial.visibility !== "private") return true;
    if (hasStewardAccess(request, memorial)) return true;
    const token = request.cookies[inviteCookieName(memorial.id)];
    return token
      ? store.isInviteValid(memorial.id, hashAccessToken(token))
      : false;
  };

  const decorateMemorial = (memorial: Memorial) => ({
    ...memorial,
    photos: memorial.media
      .filter((item) => item.kind === "photo")
      .map((item) => ({ ...item, url: mediaUrl(item.id) })),
    videos: memorial.media
      .filter((item) => item.kind === "video")
      .map((item) => ({ ...item, url: mediaUrl(item.id) })),
  });

  const renderManage = (
    request: FastifyRequest,
    reply: FastifyReply,
    memorial: Memorial,
    newInviteLink: string | null = null,
  ) => {
    noStore(reply);
    return reply.view("manage.ejs", {
      invites: store.listInvites(memorial.id),
      memorial,
      memorialUrl: absoluteUrl(requestBaseUrl(request), `/m/${memorial.slug}`),
      newInviteLink,
    });
  };

  app.get("/health", async () => ({ ok: true }));

  app.get("/", async (_request, reply) => {
    const memorials = store.listPublicMemorials().map((memorial) => {
      const cover = memorial.media.find((item) => item.kind === "photo");
      return { ...memorial, coverUrl: cover ? mediaUrl(cover.id) : null };
    });
    return reply.view("index.ejs", { memorials });
  });

  app.get("/new", async (_request, reply) => {
    return reply.view("new.ejs", {
      aiEnabled: Boolean(config.ai),
      aiLocal: config.ai?.provider.endsWith("-cli") || false,
      aiProvider: config.ai ? aiProviderLabel(config.ai) : null,
      error: null,
      maxPhotoMb: bytesToLabel(config.maxPhotoBytes),
      maxVideoMb: bytesToLabel(config.maxVideoBytes),
      requiresWriteToken: Boolean(config.writeToken),
      values: {
        birthDate: "",
        deathDate: "",
        invitees: "Family and friends",
        name: "",
        story: "",
        storyAiAssisted: "0",
        visibility: "public",
      },
    });
  });

  app.post(
    "/assist/story",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      if (!config.ai) {
        return reply.code(404).send({
          error: "AI story assistance is not configured on this LongHome.",
        });
      }

      const body = formBody(request);
      if (
        config.writeToken &&
        !tokenMatches(body.writeToken || "", config.writeToken)
      ) {
        return reply.code(401).send({ error: "The publishing token is incorrect." });
      }

      const input: StoryDraftInput = {
        birthDate: body.birthDate || null,
        deathDate: body.deathDate || null,
        length: body.length as StoryLength,
        name: (body.name || "").trim(),
        story: (body.story || "").trim(),
        tone: body.tone as StoryTone,
      };
      if (!input.name || input.name.length > 120) {
        return reply.code(400).send({ error: "Add a valid name first." });
      }
      if (!input.story || input.story.length > 10_000) {
        return reply.code(400).send({
          error: "Add some memories or rough notes, up to 10,000 characters.",
        });
      }
      if (
        (input.birthDate && !isIsoDate(input.birthDate)) ||
        (input.deathDate && !isIsoDate(input.deathDate)) ||
        (input.birthDate && input.deathDate && input.birthDate > input.deathDate)
      ) {
        return reply.code(400).send({ error: "Check the memorial dates first." });
      }
      if (!isStoryTone(body.tone || "") || !isStoryLength(body.length || "")) {
        return reply.code(400).send({ error: "Choose a valid tone and length." });
      }

      try {
        return reply.send({ draft: await draftStory(config.ai, input) });
      } catch {
        request.log.warn(
          { provider: config.ai.provider },
          "AI story assistance failed",
        );
        return reply.code(502).send({
          error: "The story assistant could not respond. Your notes are unchanged.",
        });
      }
    },
  );

  app.post(
    "/memorials",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const memorialId = randomUUID();
      const memorialMediaDir = join(store.mediaDir, memorialId);
      const values: FormValues = {
        birthDate: "",
        deathDate: "",
        invitees: "",
        name: "",
        story: "",
        storyAiAssisted: "0",
        visibility: "public",
      };
      let writeToken = "";
      const media: MemorialMedia[] = [];
      let photoCount = 0;
      let videoCount = 0;

      const fail = async (message: string) => {
        await rm(memorialMediaDir, { force: true, recursive: true });
        return reply.code(400).view("new.ejs", {
          aiEnabled: Boolean(config.ai),
          aiLocal: config.ai?.provider.endsWith("-cli") || false,
          aiProvider: config.ai ? aiProviderLabel(config.ai) : null,
          error: message,
          maxPhotoMb: bytesToLabel(config.maxPhotoBytes),
          maxVideoMb: bytesToLabel(config.maxVideoBytes),
          requiresWriteToken: Boolean(config.writeToken),
          values,
        });
      };

      try {
        await mkdir(memorialMediaDir, { recursive: true });
        for await (const part of request.parts()) {
          if (part.type === "field") {
            const value = String(part.value ?? "");
            if (part.fieldname === "writeToken") writeToken = value;
            if (part.fieldname === "name") values.name = value;
            if (part.fieldname === "birthDate") values.birthDate = value;
            if (part.fieldname === "deathDate") values.deathDate = value;
            if (part.fieldname === "story") values.story = value;
            if (part.fieldname === "storyAiAssisted") {
              values.storyAiAssisted = value;
            }
            if (part.fieldname === "visibility") values.visibility = value;
            if (part.fieldname === "invitees") values.invitees = value;
            continue;
          }

          const kind: MediaKind | null =
            part.fieldname === "photos"
              ? "photo"
              : part.fieldname === "videos"
                ? "video"
                : null;
          if (!kind || !part.filename) {
            part.file.resume();
            continue;
          }

          const allowedTypes = kind === "photo" ? photoTypes : videoTypes;
          const extension = allowedTypes.get(part.mimetype);
          if (!extension) {
            part.file.resume();
            throw new UploadError(
              kind === "photo"
                ? "Photos must be JPEG, PNG, WebP, or GIF files."
                : "Videos must be MP4, WebM, or QuickTime files.",
            );
          }
          if (kind === "photo" && ++photoCount > 12) {
            part.file.resume();
            throw new UploadError("A memorial can include up to 12 photos.");
          }
          if (kind === "video" && ++videoCount > 4) {
            part.file.resume();
            throw new UploadError("A memorial can include up to 4 videos.");
          }

          const id = randomUUID();
          const relativePath = `${memorialId}/${id}${extension}`;
          await saveUpload(
            part.file,
            join(store.mediaDir, relativePath),
            kind === "photo" ? config.maxPhotoBytes : config.maxVideoBytes,
          );
          if (part.file.truncated) {
            throw new UploadError(`${part.filename} exceeds the configured upload limit.`);
          }
          media.push({
            id,
            kind,
            mimeType: part.mimetype,
            originalName: part.filename.slice(0, 255),
            path: relativePath,
            sortOrder: kind === "photo" ? photoCount : videoCount,
          });
        }
      } catch (error) {
        request.log.warn({ error }, "memorial upload rejected");
        return fail(
          error instanceof UploadError
            ? error.message
            : "The upload could not be completed. Please try again.",
        );
      }

      if (config.writeToken && !tokenMatches(writeToken, config.writeToken)) {
        return fail("The publishing token is incorrect.");
      }
      const validationError = validateFields(values);
      if (validationError) return fail(validationError);
      if (photoCount === 0) return fail("Add at least one photo.");

      const labels = inviteLabels(values.invitees);
      if (labels.length > 10) return fail("Create no more than 10 invitations at once.");
      const createdInvites: CreatedInvite[] =
        values.visibility === "private"
          ? (labels.length ? labels : ["Family and friends"]).map((label) => ({
              id: randomUUID(),
              label: label.slice(0, 120),
              token: createAccessToken(),
            }))
          : [];
      const invites: NewMemorialInvite[] = createdInvites.map((invite) => ({
        id: invite.id,
        label: invite.label,
        tokenHash: hashAccessToken(invite.token),
      }));
      const stewardToken = createAccessToken();

      let memorial;
      try {
        memorial = store.createMemorial({
          birthDate: values.birthDate || null,
          deathDate: values.deathDate || null,
          id: memorialId,
          invites,
          media,
          name: values.name.trim(),
          slug:
            values.visibility === "private"
              ? `memorial-${randomBytes(8).toString("hex")}`
              : slugify(values.name),
          stewardTokenHash: hashAccessToken(stewardToken),
          story: values.story.trim() || null,
          storyAiAssisted: Boolean(
            config.ai && values.story.trim() && values.storyAiAssisted === "1",
          ),
          visibility: values.visibility as Visibility,
        });
      } catch (error) {
        request.log.error({ error }, "memorial could not be persisted");
        return fail("The memorial could not be saved. Please try again.");
      }

      setAccessCookie(
        request,
        reply,
        stewardCookieName(memorial.id),
        stewardToken,
      );
      noStore(reply);
      const baseUrl = requestBaseUrl(request);
      return reply.code(201).view("created.ejs", {
        inviteLinks: createdInvites.map((invite) => ({
          label: invite.label,
          url: absoluteUrl(baseUrl, `/invite/${invite.token}`),
        })),
        memorial,
        memorialUrl: absoluteUrl(baseUrl, `/m/${memorial.slug}`),
        stewardUrl: absoluteUrl(baseUrl, `/steward/${stewardToken}`),
      });
    },
  );

  app.get<{ Params: { token: string } }>(
    "/invite/:token",
    async (request, reply) => {
      const memorial = store.authenticateInvite(hashAccessToken(request.params.token));
      if (!memorial) return reply.code(404).view("not-found.ejs");
      setAccessCookie(
        request,
        reply,
        inviteCookieName(memorial.id),
        request.params.token,
      );
      noStore(reply);
      return reply.redirect(`/m/${memorial.slug}`, 303);
    },
  );

  app.get<{ Params: { token: string } }>(
    "/steward/:token",
    async (request, reply) => {
      const memorial = store.authenticateSteward(hashAccessToken(request.params.token));
      if (!memorial) return reply.code(404).view("not-found.ejs");
      setAccessCookie(
        request,
        reply,
        stewardCookieName(memorial.id),
        request.params.token,
      );
      noStore(reply);
      return reply.redirect(`/manage/${memorial.slug}`, 303);
    },
  );

  app.get<{ Params: { slug: string } }>("/m/:slug", async (request, reply) => {
    const memorial = store.getMemorial(request.params.slug);
    if (!memorial) return reply.code(404).view("not-found.ejs");
    if (!hasMemorialAccess(request, memorial)) {
      noStore(reply);
      return reply.code(401).view("private.ejs", { memorial });
    }
    reply.header("Cache-Control", "no-store");
    if (memorial.visibility !== "public") {
      reply.header("X-Robots-Tag", "noindex, nofollow");
    }
    return reply.view("memorial.ejs", {
      memorial: decorateMemorial(memorial),
    });
  });

  app.get<{ Params: { id: string } }>("/media/:id", async (request, reply) => {
    const found = store.getMedia(request.params.id);
    if (!found) {
      return reply.code(404).view("not-found.ejs");
    }
    if (!hasMemorialAccess(request, found.memorial)) {
      noStore(reply);
      return reply.code(404).view("not-found.ejs");
    }
    const root = `${resolve(store.mediaDir)}${sep}`;
    const absolutePath = resolve(store.mediaDir, found.media.path);
    if (!absolutePath.startsWith(root)) {
      request.log.error({ mediaId: found.media.id }, "invalid stored media path");
      return reply.code(500).send("Media path is invalid.");
    }
    reply.type(found.media.mimeType);
    reply.header("Cache-Control", "no-store");
    return reply.send(createReadStream(absolutePath));
  });

  app.get<{ Params: { slug: string } }>(
    "/manage/:slug",
    async (request, reply) => {
      const memorial = store.getMemorial(request.params.slug);
      if (!memorial || !hasStewardAccess(request, memorial)) {
        return reply.code(404).view("not-found.ejs");
      }
      return renderManage(request, reply, memorial);
    },
  );

  app.post<{ Params: { slug: string } }>(
    "/manage/:slug/visibility",
    async (request, reply) => {
      const memorial = store.getMemorial(request.params.slug);
      if (!memorial || !hasStewardAccess(request, memorial)) {
        return reply.code(404).view("not-found.ejs");
      }
      const visibility = formBody(request).visibility || "";
      if (!isVisibility(visibility)) return reply.code(400).send("Invalid visibility.");
      store.setVisibility(memorial.id, visibility);
      return reply.redirect(`/manage/${memorial.slug}`, 303);
    },
  );

  app.post<{ Params: { slug: string } }>(
    "/manage/:slug/invites",
    async (request, reply) => {
      const memorial = store.getMemorial(request.params.slug);
      if (!memorial || !hasStewardAccess(request, memorial)) {
        return reply.code(404).view("not-found.ejs");
      }
      const label = (formBody(request).label || "").trim();
      if (!label || label.length > 120) {
        return reply.code(400).send("Invitation label must be 1–120 characters.");
      }
      const token = createAccessToken();
      store.createInvite(memorial.id, {
        id: randomUUID(),
        label,
        tokenHash: hashAccessToken(token),
      });
      const link = absoluteUrl(requestBaseUrl(request), `/invite/${token}`);
      return renderManage(request, reply, memorial, link);
    },
  );

  app.post<{ Params: { inviteId: string; slug: string } }>(
    "/manage/:slug/invites/:inviteId/revoke",
    async (request, reply) => {
      const memorial = store.getMemorial(request.params.slug);
      if (!memorial || !hasStewardAccess(request, memorial)) {
        return reply.code(404).view("not-found.ejs");
      }
      store.revokeInvite(memorial.id, request.params.inviteId);
      return reply.redirect(`/manage/${memorial.slug}`, 303);
    },
  );

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).view("not-found.ejs");
  });

  return app;
}
