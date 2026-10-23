// share-preview (S9-02, D44/D45, spec §3.6; plan docs/plans/2026-10-22-s9-links.md "share-preview"): what a link
// shows to anyone holding it, with no account. Deployed with verify_jwt = false (config.toml), so a browser calls it
// with a plain GET and no Authorization header: `GET ?t=<token>`.
// - A live send link: 200 { kind: 'send', spots, sender, expires_at }. The spots are the send's frozen payload (D40),
//   by an allow-list of fields (never the payload's spot id), each with photo_urls signed for 600 s. Only objects
//   listed under sends/<send_id>/ that a payload photo names get a URL; a path as the sender wrote it is never signed
//   (the service role would sign anyone's photo). The sender is the preview_link row's (the profile), never the
//   payload's.
// - A live invite link: 200 { kind: 'invite', list_name, inviter, expires_at }, no spots.
// - Anything else (unknown, malformed, expired, revoked, withdrawn, used, unshared or deleted list): 404 with exactly
//   {"error":"gone"} and the same headers, never saying which. A database error is 500 { error: 'unavailable' }.
// JSON only, never HTML (Edge Functions can't serve it, D45); the page in web/share/ renders it. The token is hashed
// here (SHA-256, lowercase hex, as the app and redeem_invite do) and never logged.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

const BUCKET = 'photos';
/** A signed photo URL lives 10 minutes. */
const SIGNED_URL_SECONDS = 600;
/** The Storage API's page size for list. */
const PAGE = 1000;
/** 16 random bytes as base64url (the app's newToken). */
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const MEDIA_FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jpg$/;

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};
/** Built once, so every dead case answers the same bytes. */
const GONE = JSON.stringify({ error: 'gone' });

const json = (status: number, body: string) => new Response(body, { status, headers: HEADERS });
const gone = () => json(404, GONE);

type PreviewRow = {
  kind: 'send' | 'invite';
  send_id: string | null;
  payload: unknown;
  list_name: string | null;
  sender_username: string | null;
  sender_display_name: string | null;
  expires_at: string | null;
};

type SpotOut = {
  name: string | null;
  generated_name: string | null;
  lat: number | null;
  lng: number | null;
  feature_types: string[];
  stopped: boolean;
  natural_speed: number | null;
  notes: string | null;
  photo_urls: string[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : null);
const finite = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

async function sha256Hex(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The media ids of the photo files directly under sends/<sendId>/, all pages. */
async function stagedMediaIds(admin: SupabaseClient, sendId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(BUCKET).list(`sends/${sendId}`, { limit: PAGE, offset });
    if (error) throw error;
    for (const entry of data) {
      const match = entry.id === null ? null : MEDIA_FILE_RE.exec(entry.name);
      if (match) ids.add(match[1]);
    }
    if (data.length < PAGE) return ids;
  }
}

/**
 * storage-js builds a signed URL on the client's SUPABASE_URL, which in the local edge runtime is the internal
 * gateway (not reachable from a browser). PUBLIC_SUPABASE_URL (config.toml [edge_runtime.secrets] locally; the cloud's
 * SUPABASE_URL is public already) replaces everything before the path, port and any path prefix included (a value
 * with no port, e.g. https://box.tailnet.ts.net, must not keep the gateway's :8000); the path and the signature (which
 * signs the object path, not the host) stay as they are.
 */
function publicUrl(signedUrl: string, publicOrigin: string | null): string {
  if (!publicOrigin) return signedUrl;
  const url = new URL(signedUrl);
  return publicOrigin.replace(/\/+$/, '') + url.pathname + url.search;
}

async function sendSpots(admin: SupabaseClient, row: PreviewRow, publicOrigin: string | null): Promise<SpotOut[]> {
  const rawSpots = isObject(row.payload) && Array.isArray(row.payload.spots) ? row.payload.spots : [];
  const staged = row.send_id ? await stagedMediaIds(admin, row.send_id) : new Set<string>();

  const photoPaths: string[][] = [];
  const spots: SpotOut[] = rawSpots.filter(isObject).map((spot) => {
    const paths: string[] = [];
    for (const photo of Array.isArray(spot.photos) ? spot.photos : []) {
      const mediaId = isObject(photo) ? text(photo.media_id) : null;
      if (mediaId && staged.has(mediaId)) {
        paths.push(`sends/${row.send_id}/${mediaId}.jpg`);
        staged.delete(mediaId); // one URL per object, even if the payload names it twice
      }
    }
    photoPaths.push(paths);
    return {
      name: text(spot.name),
      generated_name: text(spot.generated_name),
      lat: finite(spot.lat),
      lng: finite(spot.lng),
      feature_types: Array.isArray(spot.feature_types)
        ? spot.feature_types.filter((t): t is string => typeof t === 'string')
        : [],
      stopped: spot.stopped === true,
      natural_speed: finite(spot.natural_speed),
      notes: text(spot.notes),
      photo_urls: [],
    };
  });

  const all = photoPaths.flat();
  if (all.length) {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(all, SIGNED_URL_SECONDS);
    if (error) throw error;
    const urlByPath = new Map<string, string>();
    for (const entry of data) {
      if (!entry.error && entry.path && entry.signedUrl) {
        urlByPath.set(entry.path, publicUrl(entry.signedUrl, publicOrigin));
      }
    }
    spots.forEach((spot, i) => {
      spot.photo_urls = photoPaths[i].flatMap((path) => urlByPath.get(path) ?? []);
    });
  }
  return spots;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (req.method !== 'GET') return json(405, JSON.stringify({ error: 'method not allowed' }));

  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (!TOKEN_RE.test(token)) return gone();

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    console.error('share-preview: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json(500, JSON.stringify({ error: 'unavailable' }));
  }
  const publicOrigin = Deno.env.get('PUBLIC_SUPABASE_URL') || null;
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data, error } = await admin.rpc('preview_link', { p_sha: await sha256Hex(token) });
    if (error) throw error;
    const row = (data as PreviewRow[] | null)?.[0];
    if (!row) return gone();
    const sender = { username: row.sender_username, display_name: row.sender_display_name };
    if (row.kind === 'invite') {
      return json(
        200,
        JSON.stringify({ kind: 'invite', list_name: row.list_name, inviter: sender, expires_at: row.expires_at }),
      );
    }
    const spots = await sendSpots(admin, row, publicOrigin);
    return json(200, JSON.stringify({ kind: 'send', spots, sender, expires_at: row.expires_at }));
  } catch (error) {
    // never the token
    console.error('share-preview failed', error);
    return json(500, JSON.stringify({ error: 'unavailable' }));
  }
});
