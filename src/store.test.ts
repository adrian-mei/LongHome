import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStore } from "./store.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("LongHomeStore migrations", () => {
  it("keeps pre-privacy memorials public and readable", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "longhome-migration-"));
    directories.push(dataDir);
    const database = new Database(join(dataDir, "longhome.sqlite"));
    database.exec(`
      CREATE TABLE memorials (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        birth_date TEXT,
        death_date TEXT,
        story TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE media (
        id TEXT PRIMARY KEY,
        memorial_id TEXT NOT NULL REFERENCES memorials(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      );
      INSERT INTO memorials (id, slug, name)
      VALUES ('legacy-id', 'legacy-person', 'Legacy Person');
    `);
    database.close();

    const store = createStore(dataDir);
    const memorial = store.getMemorial("legacy-person");
    expect(memorial?.name).toBe("Legacy Person");
    expect(memorial?.storyAiAssisted).toBe(false);
    expect(memorial?.visibility).toBe("public");
    expect(store.listPublicMemorials()).toHaveLength(1);
    store.close();
  });
});
