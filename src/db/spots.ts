import type { SQLiteDatabase } from 'expo-sqlite';
import type { Spot, FeatureDetails, InRun, Landing, SpotMetadata } from '@/src/types';
import { SpotStatus } from '@/src/types';

interface SpotRow {
  id: string;
  name: string | null;
  generated_name: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  status: string;
  feature_json: string;
  in_run_json: string;
  landing_json: string;
  metadata_json: string;
  primary_photo_id: string | null;
}

function rowToSpot(row: SpotRow): Spot {
  return {
    id: row.id,
    name: row.name ?? undefined,
    generated_name: row.generated_name ?? undefined,
    location: { latitude: row.latitude, longitude: row.longitude },
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? undefined,
    status: row.status as SpotStatus,
    feature: JSON.parse(row.feature_json) as FeatureDetails,
    in_run: JSON.parse(row.in_run_json) as InRun,
    landing: JSON.parse(row.landing_json) as Landing,
    metadata: JSON.parse(row.metadata_json) as SpotMetadata,
    primary_photo_id: row.primary_photo_id ?? undefined,
  };
}

export async function insertSpot(db: SQLiteDatabase, spot: Spot): Promise<void> {
  await db.runAsync(
    `INSERT INTO spots (id, name, generated_name, latitude, longitude, created_at, updated_at, deleted_at, status, feature_json, in_run_json, landing_json, metadata_json, primary_photo_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    spot.id,
    spot.name ?? null,
    spot.generated_name ?? null,
    spot.location.latitude,
    spot.location.longitude,
    spot.created_at,
    spot.updated_at,
    spot.deleted_at ?? null,
    spot.status,
    JSON.stringify(spot.feature),
    JSON.stringify(spot.in_run),
    JSON.stringify(spot.landing),
    JSON.stringify(spot.metadata),
    spot.primary_photo_id ?? null,
  );
}

export async function getSpot(db: SQLiteDatabase, id: string): Promise<Spot | null> {
  const row = await db.getFirstAsync<SpotRow>(
    `SELECT * FROM spots WHERE id = ? AND deleted_at IS NULL`,
    id,
  );
  return row ? rowToSpot(row) : null;
}

export async function getSpots(db: SQLiteDatabase): Promise<Spot[]> {
  const rows = await db.getAllAsync<SpotRow>(
    `SELECT * FROM spots WHERE deleted_at IS NULL ORDER BY created_at DESC`,
  );
  return rows.map(rowToSpot);
}

export async function updateSpot(
  db: SQLiteDatabase,
  id: string,
  updates: Partial<Omit<Spot, 'id' | 'created_at'>>,
): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    values.push(updates.name ?? null);
  }
  if (updates.generated_name !== undefined) {
    setClauses.push('generated_name = ?');
    values.push(updates.generated_name ?? null);
  }
  if (updates.location) {
    setClauses.push('latitude = ?, longitude = ?');
    values.push(updates.location.latitude, updates.location.longitude);
  }
  if (updates.status) {
    setClauses.push('status = ?');
    values.push(updates.status);
  }
  if (updates.feature) {
    setClauses.push('feature_json = ?');
    values.push(JSON.stringify(updates.feature));
  }
  if (updates.in_run) {
    setClauses.push('in_run_json = ?');
    values.push(JSON.stringify(updates.in_run));
  }
  if (updates.landing) {
    setClauses.push('landing_json = ?');
    values.push(JSON.stringify(updates.landing));
  }
  if (updates.metadata) {
    setClauses.push('metadata_json = ?');
    values.push(JSON.stringify(updates.metadata));
  }
  if (updates.primary_photo_id !== undefined) {
    setClauses.push('primary_photo_id = ?');
    values.push(updates.primary_photo_id ?? null);
  }

  setClauses.push("updated_at = datetime('now')");
  values.push(id);

  await db.runAsync(
    `UPDATE spots SET ${setClauses.join(', ')} WHERE id = ?`,
    ...values,
  );
}

export async function softDeleteSpot(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(
    `UPDATE spots SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    id,
  );
}
