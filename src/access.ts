import { createHash, randomBytes } from "node:crypto";

export function createAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "");
}

export function inviteCookieName(memorialId: string): string {
  return `lh_invite_${safeId(memorialId)}`;
}

export function stewardCookieName(memorialId: string): string {
  return `lh_steward_${safeId(memorialId)}`;
}

export function absoluteUrl(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl.replace(/\/$/, "")}/`).toString();
}
