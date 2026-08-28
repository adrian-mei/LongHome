import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fastifyView from "@fastify/view";
import ejs from "ejs";
import Fastify, { type FastifyInstance } from "fastify";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { timingSafeEqual, randomBytes, randomUUID } from "node:crypto";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { loadConfig, type LongHomeConfig } from "./config.js";
import { createStore } from "./store.js";
import type { MediaKind, MemorialMedia } from "./types.js";

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

class UploadError extends Error {}

interface FormValues {
  birthDate: string;
  deathDate: string;
  name: string;
  story: string;
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

function mediaUrl(path: string): string {
  return `/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function bytesToLabel(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function validateFields(values: FormValues): string | null {
  if (!values.name.trim()) return "A name is required.";
  if (values.name.trim().length > 120) return "Name must be 120 characters or less.";
  if (values.story.length > 20_000) return "Story must be 20,000 characters or less.";
  if (values.birthDate && !isIsoDate(values.birthDate)) return "Birth date is invalid.";
  if (values.deathDate && !isIsoDate(values.deathDate)) return "End date is invalid.";
  if (
    values.birthDate &&
    values.deathDate &&
    values.birthDate > values.deathDate
  ) {
    return "Birth date must be before the end date.";
  }
  return null;
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
): Promise<FastifyInstance> {
  const config = loadConfig(overrides);
  const store = createStore(config.dataDir);
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        "media-src": ["'self'", "blob:"],
      },
    },
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: {
      fields: 8,
      fileSize: Math.max(config.maxPhotoBytes, config.maxVideoBytes),
      files: 16,
      parts: 24,
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
  await app.register(fastifyStatic, {
    decorateReply: false,
    prefix: "/media/",
    root: store.mediaDir,
  });

  app.addHook("onClose", async () => store.close());

  app.get("/health", async () => ({ ok: true }));

  app.get("/", async (_request, reply) => {
    const memorials = store.listMemorials().map((memorial) => ({
      ...memorial,
      coverUrl: memorial.media.find((item) => item.kind === "photo")
        ? mediaUrl(memorial.media.find((item) => item.kind === "photo")!.path)
        : null,
    }));
    return reply.view("index.ejs", { memorials });
  });

  app.get("/new", async (_request, reply) => {
    return reply.view("new.ejs", {
      error: null,
      maxPhotoMb: bytesToLabel(config.maxPhotoBytes),
      maxVideoMb: bytesToLabel(config.maxVideoBytes),
      requiresWriteToken: Boolean(config.writeToken),
      values: { birthDate: "", deathDate: "", name: "", story: "" },
    });
  });

  app.post(
    "/memorials",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const memorialId = randomUUID();
      const memorialMediaDir = join(store.mediaDir, memorialId);
      const values: FormValues = {
        birthDate: "",
        deathDate: "",
        name: "",
        story: "",
      };
      let writeToken = "";
      const media: MemorialMedia[] = [];
      let photoCount = 0;
      let videoCount = 0;

      const fail = async (message: string) => {
        await rm(memorialMediaDir, { force: true, recursive: true });
        return reply.code(400).view("new.ejs", {
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
          const destination = join(store.mediaDir, relativePath);
          await saveUpload(
            part.file,
            destination,
            kind === "photo" ? config.maxPhotoBytes : config.maxVideoBytes,
          );
          if (part.file.truncated) {
            throw new UploadError(
              `${part.filename} exceeds the configured upload limit.`,
            );
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

      if (
        config.writeToken &&
        !tokenMatches(writeToken, config.writeToken)
      ) {
        return fail("The publishing token is incorrect.");
      }
      const validationError = validateFields(values);
      if (validationError) return fail(validationError);
      if (photoCount === 0) return fail("Add at least one photo.");

      let memorial;
      try {
        memorial = store.createMemorial({
          birthDate: values.birthDate || null,
          deathDate: values.deathDate || null,
          id: memorialId,
          media,
          name: values.name.trim(),
          slug: slugify(values.name),
          story: values.story.trim() || null,
        });
      } catch (error) {
        request.log.error({ error }, "memorial could not be persisted");
        return fail("The memorial could not be saved. Please try again.");
      }

      return reply.redirect(`/m/${memorial.slug}`, 303);
    },
  );

  app.get<{ Params: { slug: string } }>("/m/:slug", async (request, reply) => {
    const memorial = store.getMemorial(request.params.slug);
    if (!memorial) {
      return reply.code(404).view("not-found.ejs");
    }
    return reply.view("memorial.ejs", {
      memorial: {
        ...memorial,
        photos: memorial.media
          .filter((item) => item.kind === "photo")
          .map((item) => ({ ...item, url: mediaUrl(item.path) })),
        videos: memorial.media
          .filter((item) => item.kind === "video")
          .map((item) => ({ ...item, url: mediaUrl(item.path) })),
      },
    });
  });

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).view("not-found.ejs");
  });

  return app;
}
