export type MediaKind = "photo" | "video";

export interface MemorialMedia {
  id: string;
  kind: MediaKind;
  mimeType: string;
  originalName: string;
  path: string;
  sortOrder: number;
}

export interface Memorial {
  birthDate: string | null;
  createdAt: string;
  deathDate: string | null;
  id: string;
  media: MemorialMedia[];
  name: string;
  slug: string;
  story: string | null;
}

export interface NewMemorial {
  birthDate: string | null;
  deathDate: string | null;
  id: string;
  media: MemorialMedia[];
  name: string;
  slug: string;
  story: string | null;
}
