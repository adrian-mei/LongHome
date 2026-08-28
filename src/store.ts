import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Memorial, MemorialMedia, NewMemorial } from "./types.js";

interface MemorialRow {
  birth_date: string | null;
  created_at: string;
  death_date: string | null;
  id: string;
  name: string;
  slug: string;
  story: string | null;
}

interface MediaRow {
  id: string;
  kind: "photo" | "video";
  mime_type: string;
  original_name: string;
  path: string;
  sort_order: number;
}

export interface LongHomeStore {
  close(): void;
  createMemorial(input: NewMemorial): Memorial;
  getMemorial(slug: string): Memorial | null;
  listMemorials(): Memorial[];
  mediaDir: string;
}

function mapMedia(row: MediaRow): MemorialMedia {
  return {
    id: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    originalName: row.original_name,
    path: row.path,
    sortOrder: row.sort_order,
  };
}

export function createStore(dataDir: string): LongHomeStore {
  mkdirSync(dataDir, { recursive: true });
  const mediaDir = join(dataDir, "media");
  mkdirSync(mediaDir, { recursive: true });

  const database = new Database(join(dataDir, "longhome.sqlite"));
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS memorials (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      birth_date TEXT,
      death_date TEXT,
      story TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      memorial_id TEXT NOT NULL REFERENCES memorials(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
      path TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS media_memorial_order
      ON media(memorial_id, kind, sort_order);
  `);

  const selectMedia = database.prepare(`
    SELECT id, kind, path, original_name, mime_type, sort_order
    FROM media
    WHERE memorial_id = ?
    ORDER BY kind, sort_order
  `);

  function hydrate(row: MemorialRow): Memorial {
    const media = (selectMedia.all(row.id) as MediaRow[]).map(mapMedia);
    return {
      birthDate: row.birth_date,
      createdAt: row.created_at,
      deathDate: row.death_date,
      id: row.id,
      media,
      name: row.name,
      slug: row.slug,
      story: row.story,
    };
  }

  const insertMemorial = database.prepare(`
    INSERT INTO memorials (id, slug, name, birth_date, death_date, story)
    VALUES (@id, @slug, @name, @birthDate, @deathDate, @story)
  `);
  const insertMedia = database.prepare(`
    INSERT INTO media (
      id, memorial_id, kind, path, original_name, mime_type, sort_order
    ) VALUES (
      @id, @memorialId, @kind, @path, @originalName, @mimeType, @sortOrder
    )
  `);

  const createTransaction = database.transaction((input: NewMemorial) => {
    insertMemorial.run(input);
    for (const item of input.media) {
      insertMedia.run({ ...item, memorialId: input.id });
    }
  });

  return {
    close() {
      database.close();
    },
    createMemorial(input) {
      createTransaction(input);
      const created = database
        .prepare("SELECT * FROM memorials WHERE id = ?")
        .get(input.id) as MemorialRow;
      return hydrate(created);
    },
    getMemorial(slug) {
      const row = database
        .prepare("SELECT * FROM memorials WHERE slug = ?")
        .get(slug) as MemorialRow | undefined;
      return row ? hydrate(row) : null;
    },
    listMemorials() {
      const rows = database
        .prepare("SELECT * FROM memorials ORDER BY created_at DESC, name ASC")
        .all() as MemorialRow[];
      return rows.map(hydrate);
    },
    mediaDir,
  };
}
