// account-delete (S4-05, D51): deletes the calling rider's account. The user comes only from the caller's JWT
// (Authorization: Bearer <jwt>, resolved by auth.getUser); the request body is never read, so no request can name
// another user. Order: the rider's Storage objects first (<uid>/… and sends/<id>/… of every send from or to them, and
// any photo they staged for a send that never got its row, S7), then the auth user, whose deletion cascades through
// profiles to every row they own (S3 schema, `on delete cascade`). Storage goes first so a retry after a later failure still finds the files; the reverse would orphan
// them, as nothing would point at them any more. A direct DELETE on storage.objects is blocked, so files go through
// the Storage API. A photo uploaded between the listing and the user delete is left behind (S8 may sweep orphans).
// Responses: 200 { ok: true }, 401 { error: 'unauthorized' }, 405 { error: 'method not allowed' },
// 500 { error: 'delete failed' } (the detail only in the function's log). Plan: docs/plans/2026-10-22-s4-accounts.md.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

import { corsHeaders } from '../_shared/cors.ts';

const BUCKET = 'photos';
/** The Storage API's page size for list and its limit for one remove. */
const PAGE = 1000;
/** Folders listed in parallel: a rider with thousands of spots has a folder each, and one at a time is too slow. */
const LISTS_AT_ONCE = 20;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Every entry directly under `prefix`, all pages. A folder has `id` null; a file has an id. */
async function listAll(admin: SupabaseClient, prefix: string): Promise<{ name: string; id: string | null }[]> {
  const entries: { name: string; id: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw error;
    entries.push(...data);
    if (data.length < PAGE) return entries;
  }
}

/** The paths of every file under the prefixes, down any depth of folders; LISTS_AT_ONCE folders are read at a time. */
async function filesUnder(admin: SupabaseClient, prefixes: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < prefixes.length; i += LISTS_AT_ONCE) {
    const batch = prefixes.slice(i, i + LISTS_AT_ONCE);
    const listed = await Promise.all(batch.map((prefix) => listAll(admin, prefix)));
    const folders: string[] = [];
    listed.forEach((entries, j) => {
      for (const entry of entries) {
        const path = `${batch[j]}/${entry.name}`;
        if (entry.id === null) folders.push(path);
        else paths.push(path);
      }
    });
    if (folders.length) paths.push(...(await filesUnder(admin, folders)));
  }
  return paths;
}

async function deleteUserData(admin: SupabaseClient, uid: string): Promise<void> {
  // Sends to the rider go too: their rows cascade away with the account, and then nobody (not even the sender) may
  // read or remove the files. PostgREST caps a response at max_rows (1000), so the sends are read in pages.
  const prefixes = [uid];
  for (let offset = 0; ; offset += PAGE) {
    const { data: sends, error } = await admin
      .from('sends')
      .select('id')
      .or(`sender.eq.${uid},recipient.eq.${uid}`)
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    prefixes.push(...sends.map((send: { id: string }) => `sends/${send.id}`));
    if (sends.length < PAGE) break;
  }
  const paths = await filesUnder(admin, prefixes);
  // photos staged for a send that never got its row (S7, D77: the app stopped between the copy and create_send)
  const { data: staged, error: stagedError } = await admin.rpc('staged_send_objects', { p_uid: uid });
  if (stagedError) throw stagedError;
  paths.push(...((staged ?? []) as string[]));

  for (let i = 0; i < paths.length; i += PAGE) {
    const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + PAGE));
    if (error) throw error;
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
  if (deleteError) throw deleteError;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) {
    console.error('account-delete: missing SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');
    return json(500, { error: 'delete failed' });
  }

  const jwt = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!jwt) return json(401, { error: 'unauthorized' });

  const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
  const anon = createClient(url, anonKey, noSession);
  const { data: userData, error: userError } = await anon.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (userError || !uid) return json(401, { error: 'unauthorized' });

  const admin = createClient(url, serviceRoleKey, noSession);
  try {
    await deleteUserData(admin, uid);
  } catch (error) {
    console.error('account-delete failed', uid, error);
    return json(500, { error: 'delete failed' });
  }
  return json(200, { ok: true });
});
