import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  Memorial,
  MemorialInvite,
  MemorialMedia,
  NewMemorial,
  NewMemorialInvite,
  Visibility,
} from "./types.js";

interface MemorialRow {
  birth_date: string | null;
  created_at: string;
  death_date: string | null;
  id: string;
  name: string;
  slug: string;
  story: string | null;
  visibility: Visibility;
}

interface MediaRow {
  id: string;
  kind: "photo" | "video";
  memorial_id: string;
  mime_type: string;
  original_name: string;
  path: string;
  sort_order: number;
}

interface InviteRow {
  created_at: string;
  id: string;
  label: string;
  last_used_at: string | null;
  memorial_id: string;
  revoked_at: string | null;
}

export interface LongHomeStore {
  authenticateInvite(tokenHash: string): Memorial | null;
  authenticateSteward(tokenHash: string): Memorial | null;
  close(): void;
  createInvite(
    memorialId: string,
    invite: NewMemorialInvite,
  ): MemorialInvite;
  createMemorial(input: NewMemorial): Memorial;
  getMedia(id: string): { media: MemorialMedia; memorial: Memorial } | null;
  getMemorial(slug: string): Memorial | null;
  isInviteValid(memorialId: string, tokenHash: string): boolean;
  isStewardValid(memorialId: string, tokenHash: string): boolean;
  listInvites(memorialId: string): MemorialInvite[];
  listPublicMemorials(): Memorial[];
  mediaDir: string;
  revokeInvite(memorialId: string, inviteId: string): boolean;
  setVisibility(memorialId: string, visibility: Visibility): void;
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

function mapInvite(row: InviteRow): MemorialInvite {
  return {
    createdAt: row.created_at,
    id: row.id,
    label: row.label,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
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

  const memorialColumns = database
    .prepare("PRAGMA table_info(memorials)")
    .all() as Array<{ name: string }>;
  const memorialColumnNames = new Set(memorialColumns.map((column) => column.name));
  if (!memorialColumnNames.has("visibility")) {
    database.exec(
      "ALTER TABLE memorials ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted', 'private'))",
    );
  }
  if (!memorialColumnNames.has("steward_token_hash")) {
    database.exec("ALTER TABLE memorials ADD COLUMN steward_token_hash TEXT");
  }

  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS memorial_steward_token
      ON memorials(steward_token_hash)
      WHERE steward_token_hash IS NOT NULL;

    CREATE TABLE IF NOT EXISTS memorial_invites (
      id TEXT PRIMARY KEY,
      memorial_id TEXT NOT NULL REFERENCES memorials(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT,
      revoked_at TEXT
    );

    CREATE INDEX IF NOT EXISTS memorial_invites_memorial
      ON memorial_invites(memorial_id, created_at);
  `);

  const selectMedia = database.prepare(`
    SELECT id, memorial_id, kind, path, original_name, mime_type, sort_order
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
      visibility: row.visibility,
    };
  }

  function memorialById(id: string): Memorial | null {
    const row = database
      .prepare("SELECT * FROM memorials WHERE id = ?")
      .get(id) as MemorialRow | undefined;
    return row ? hydrate(row) : null;
  }

  const insertMemorial = database.prepare(`
    INSERT INTO memorials (
      id, slug, name, birth_date, death_date, story,
      visibility, steward_token_hash
    ) VALUES (
      @id, @slug, @name, @birthDate, @deathDate, @story,
      @visibility, @stewardTokenHash
    )
  `);
  const insertMedia = database.prepare(`
    INSERT INTO media (
      id, memorial_id, kind, path, original_name, mime_type, sort_order
    ) VALUES (
      @id, @memorialId, @kind, @path, @originalName, @mimeType, @sortOrder
    )
  `);
  const insertInvite = database.prepare(`
    INSERT INTO memorial_invites (id, memorial_id, label, token_hash)
    VALUES (@id, @memorialId, @label, @tokenHash)
  `);

  const createTransaction = database.transaction((input: NewMemorial) => {
    insertMemorial.run(input);
    for (const item of input.media) {
      insertMedia.run({ ...item, memorialId: input.id });
    }
    for (const invite of input.invites) {
      insertInvite.run({ ...invite, memorialId: input.id });
    }
  });

  return {
    authenticateInvite(tokenHash) {
      const invite = database
        .prepare(`
          SELECT * FROM memorial_invites
          WHERE token_hash = ? AND revoked_at IS NULL
        `)
        .get(tokenHash) as InviteRow | undefined;
      if (!invite) return null;
      database
        .prepare("UPDATE memorial_invites SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(invite.id);
      return memorialById(invite.memorial_id);
    },
    authenticateSteward(tokenHash) {
      const row = database
        .prepare("SELECT * FROM memorials WHERE steward_token_hash = ?")
        .get(tokenHash) as MemorialRow | undefined;
      return row ? hydrate(row) : null;
    },
    close() {
      database.close();
    },
    createInvite(memorialId, invite) {
      insertInvite.run({ ...invite, memorialId });
      const created = database
        .prepare("SELECT * FROM memorial_invites WHERE id = ?")
        .get(invite.id) as InviteRow;
      return mapInvite(created);
    },
    createMemorial(input) {
      createTransaction(input);
      return memorialById(input.id)!;
    },
    getMedia(id) {
      const row = database
        .prepare("SELECT * FROM media WHERE id = ?")
        .get(id) as MediaRow | undefined;
      if (!row) return null;
      const memorial = memorialById(row.memorial_id);
      return memorial ? { media: mapMedia(row), memorial } : null;
    },
    getMemorial(slug) {
      const row = database
        .prepare("SELECT * FROM memorials WHERE slug = ?")
        .get(slug) as MemorialRow | undefined;
      return row ? hydrate(row) : null;
    },
    isInviteValid(memorialId, tokenHash) {
      return Boolean(
        database
          .prepare(`
            SELECT 1 FROM memorial_invites
            WHERE memorial_id = ? AND token_hash = ? AND revoked_at IS NULL
          `)
          .get(memorialId, tokenHash),
      );
    },
    isStewardValid(memorialId, tokenHash) {
      return Boolean(
        database
          .prepare(
            "SELECT 1 FROM memorials WHERE id = ? AND steward_token_hash = ?",
          )
          .get(memorialId, tokenHash),
      );
    },
    listInvites(memorialId) {
      const rows = database
        .prepare(`
          SELECT * FROM memorial_invites
          WHERE memorial_id = ?
          ORDER BY created_at ASC, label ASC
        `)
        .all(memorialId) as InviteRow[];
      return rows.map(mapInvite);
    },
    listPublicMemorials() {
      const rows = database
        .prepare(`
          SELECT * FROM memorials
          WHERE visibility = 'public'
          ORDER BY created_at DESC, name ASC
        `)
        .all() as MemorialRow[];
      return rows.map(hydrate);
    },
    mediaDir,
    revokeInvite(memorialId, inviteId) {
      const result = database
        .prepare(`
          UPDATE memorial_invites
          SET revoked_at = CURRENT_TIMESTAMP
          WHERE id = ? AND memorial_id = ? AND revoked_at IS NULL
        `)
        .run(inviteId, memorialId);
      return result.changes === 1;
    },
    setVisibility(memorialId, visibility) {
      database
        .prepare("UPDATE memorials SET visibility = ? WHERE id = ?")
        .run(visibility, memorialId);
    },
  };
}
