import type { SupabaseClient } from '@supabase/supabase-js';

import type { MemberRole } from '@/src/types';
import { linkUrl, newToken, tokenHash } from '@/src/utils/link-token';
import { signedInAs } from './account';
import { serverError, type ServerError } from './errors';
import { NotAllowedError } from './lists';
import { toIso } from './time';

/*
 * Links (S9, docs/plans/2026-10-22-s9-links.md "Client", D44/D45): a send link anyone holding it can look at in a
 * browser until it expires, and an invite link (7 days, one use) that joins a shared list. The server keeps only the
 * token's SHA-256 (create_link, revoke_link, list_my_links; preview_link behind the share-preview function); the
 * plain token lives only in the URL's fragment. Every call takes the client and the rider and does nothing (null)
 * without a session for that rider; a 42501 with the session there is NotAllowedError. Redeeming an invite is `redeemInvite` in join.ts (it syncs after).
 */

/** D92 *default*: where links point when EXPO_PUBLIC_SHARE_BASE_URL is unset (web/share/ served on the box). */
export const DEFAULT_SHARE_BASE_URL = 'http://localhost:8080/share/';

/** The page links open, read on every call (a test sets it). */
export const shareBaseUrl = (): string => process.env.EXPO_PUBLIC_SHARE_BASE_URL || DEFAULT_SHARE_BASE_URL;

/** The link is unknown, expired, revoked, withdrawn or used: the server never says which (§3.6). */
export class LinkGoneError extends Error {
  constructor() {
    super("That link doesn't work any more");
    this.name = 'LinkGoneError';
  }
}

export type LinkExpiry = '1d' | '7d' | '30d' | 'never';
export type LinkKind = 'send' | 'invite';
export type LinkStatus = 'active' | 'expired' | 'revoked' | 'used';

const DAY_MS = 864e5;
const EXPIRY_DAYS: Record<Exclude<LinkExpiry, 'never'>, number> = { '1d': 1, '7d': 7, '30d': 30 };
/** D44: an invite link lasts 7 days (the server cuts a later expiry to 7 days anyway). */
const INVITE_DAYS = 7;

const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

/**
 * A refusal: null when the session ended meanwhile (42501 is also "not signed in"), NotAllowedError for another 42501
 * (not the list's owner any more), else the server error with its code.
 */
async function refusal(client: SupabaseClient, uid: string, error: ServerError): Promise<null> {
  if (error.code === '42501') {
    if (!(await signedInAs(client, uid))) return null;
    throw new NotAllowedError();
  }
  throw serverError(error);
}

/** create_link with a new token; the URL carries the plain token, the server gets its hash. */
async function createLink(
  client: SupabaseClient,
  uid: string,
  args: { p_kind: LinkKind; p_target: string; p_expires_at: string | null; p_role?: MemberRole },
): Promise<string | null> {
  if (!(await signedInAs(client, uid))) return null;
  const token = newToken();
  const { error } = await client.rpc('create_link', { ...args, p_token_sha256: await tokenHash(token) });
  if (error) return refusal(client, uid, error);
  return linkUrl(shareBaseUrl(), token);
}

/** A link to the rider's send `sendId` (a link-only send, D94), expiring after `expiry` or never. */
export const createSendLink = (client: SupabaseClient, uid: string, sendId: string, expiry: LinkExpiry) =>
  createLink(client, uid, {
    p_kind: 'send',
    p_target: sendId,
    p_expires_at: expiry === 'never' ? null : daysFromNow(EXPIRY_DAYS[expiry]),
  });

/** An invite link to the rider's shared list: one use, 7 days, the joiner gets `role`. */
export const createInviteLink = (client: SupabaseClient, uid: string, listId: string, role: MemberRole) =>
  createLink(client, uid, { p_kind: 'invite', p_target: listId, p_expires_at: daysFromNow(INVITE_DAYS), p_role: role });

/** Revokes one of the rider's links (again is no error). Null without a session. */
export async function revokeLink(client: SupabaseClient, uid: string, linkId: string): Promise<true | null> {
  if (!(await signedInAs(client, uid))) return null;
  const { error } = await client.rpc('revoke_link', { p_id: linkId });
  if (error) return refusal(client, uid, error);
  return true;
}

/** One link the rider made (never its token or hash). */
export interface MyLink {
  id: string;
  kind: LinkKind;
  sendId: string | null;
  listId: string | null;
  role: MemberRole | null;
  createdAt: string;
  /** null = never */
  expiresAt: string | null;
  usedBy: { id: string; username: string | null } | null;
  status: LinkStatus;
}

interface LinkRow {
  id: string;
  kind: LinkKind;
  send_id: string | null;
  list_id: string | null;
  role: MemberRole | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  used_at: string | null;
  used_by: string | null;
  used_by_username: string | null;
}

/** Revoked wins over used, used over expired. */
function statusOf(row: LinkRow, expiresAt: string | null, now: number): LinkStatus {
  if (row.revoked_at) return 'revoked';
  if (row.used_at) return 'used';
  if (expiresAt !== null && Date.parse(expiresAt) <= now) return 'expired';
  return 'active';
}

/** A server timestamp as the app's ISO (Hermes' Date.parse rejects Postgres' shapes). */
const serverTime = (value: string) => toIso(value) ?? value;

/** The rider's links of `kind`, newest first. Null without a session; throws when the server can't be read. */
export async function listMyLinks(client: SupabaseClient, uid: string, kind: LinkKind): Promise<MyLink[] | null> {
  if (!(await signedInAs(client, uid))) return null;
  const { data, error } = await client.rpc('list_my_links', { p_kind: kind });
  if (error) throw serverError(error);
  const now = Date.now();
  return ((data ?? []) as LinkRow[]).map((row) => {
    const expiresAt = row.expires_at === null ? null : serverTime(row.expires_at);
    return {
      id: row.id,
      kind: row.kind,
      sendId: row.send_id,
      listId: row.list_id,
      role: row.role,
      createdAt: serverTime(row.created_at),
      expiresAt,
      usedBy: row.used_by ? { id: row.used_by, username: row.used_by_username } : null,
      status: statusOf(row, expiresAt, now),
    };
  });
}

/** What a live link holds, as far as the app needs it (the page shows the rest). */
export type LinkPreview =
  | { kind: 'send'; count: number; sender: string | null }
  | { kind: 'invite'; listName: string; inviter: string | null };

type PreviewBody = {
  kind?: unknown;
  spots?: unknown;
  sender?: { username?: unknown } | null;
  list_name?: unknown;
  inviter?: { username?: unknown } | null;
};

const usernameOf = (who: { username?: unknown } | null | undefined) =>
  typeof who?.username === 'string' ? who.username : null;

async function goneBody(context: { json?: () => Promise<unknown> } | undefined): Promise<boolean> {
  try {
    return ((await context?.json?.()) as { error?: unknown } | undefined)?.error === 'gone';
  } catch {
    return false;
  }
}

/**
 * Asks share-preview what a token is (no account needed there). Throws LinkGoneError for the function's 404 gone (or
 * an answer that is neither kind) and a plain error for anything else (offline, a 500).
 */
export async function previewLink(client: SupabaseClient, token: string): Promise<LinkPreview> {
  const { data, error, response } = await client.functions.invoke<PreviewBody>(`share-preview?t=${token}`, {
    method: 'GET',
  });
  if (error) {
    const context = (error as { context?: { status?: unknown; json?: () => Promise<unknown> } }).context;
    // only the function's own gone body: the gateway also answers 404 when the function isn't there
    if ((context?.status ?? response?.status) === 404 && (await goneBody(context))) throw new LinkGoneError();
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (data?.kind === 'send') {
    return { kind: 'send', count: Array.isArray(data.spots) ? data.spots.length : 0, sender: usernameOf(data.sender) };
  }
  if (data?.kind === 'invite' && typeof data.list_name === 'string') {
    return { kind: 'invite', listName: data.list_name, inviter: usernameOf(data.inviter) };
  }
  throw new LinkGoneError();
}
