export type MediaKind = "photo" | "video";
export type Visibility = "public" | "unlisted" | "private";

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
  visibility: Visibility;
}

export interface MemorialInvite {
  createdAt: string;
  id: string;
  label: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface NewMemorialInvite {
  id: string;
  label: string;
  tokenHash: string;
}

export interface NewMemorial {
  birthDate: string | null;
  deathDate: string | null;
  id: string;
  media: MemorialMedia[];
  name: string;
  slug: string;
  stewardTokenHash: string;
  story: string | null;
  visibility: Visibility;
  invites: NewMemorialInvite[];
}
