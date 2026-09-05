import { Pool } from "pg";
import type { NotesMap, UserNote } from "./types";

/**
 * מסד הנתונים אופציונלי. אם אין POSTGRES_URL, ה-API מחזיר storage: "local"
 * והדפדפן שומר את ההערות אצלו. ברגע שמחברים מסד ב-Vercel, הכל עובר לענן.
 */
const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

export const hasDb = Boolean(connectionString);

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost")
        ? undefined
        : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

async function ensureTable() {
  if (!ready) {
    ready = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS listing_notes (
           id         TEXT PRIMARY KEY,
           note       TEXT NOT NULL DEFAULT '',
           status     TEXT NOT NULL DEFAULT '',
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`
      )
      .then(() => undefined);
  }
  return ready;
}

export async function readNotes(): Promise<NotesMap> {
  await ensureTable();
  const { rows } = await getPool().query<{
    id: string;
    note: string;
    status: string;
    updated_at: Date;
  }>(`SELECT id, note, status, updated_at FROM listing_notes`);

  const map: NotesMap = {};
  for (const r of rows) {
    map[r.id] = {
      id: r.id,
      note: r.note,
      status: r.status,
      updatedAt: r.updated_at.toISOString(),
    };
  }
  return map;
}

export async function writeNote(
  id: string,
  note: string,
  status: string
): Promise<UserNote> {
  await ensureTable();
  const { rows } = await getPool().query<{
    id: string;
    note: string;
    status: string;
    updated_at: Date;
  }>(
    `INSERT INTO listing_notes (id, note, status, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE
       SET note = EXCLUDED.note,
           status = EXCLUDED.status,
           updated_at = now()
     RETURNING id, note, status, updated_at`,
    [id, note, status]
  );

  const r = rows[0];
  return {
    id: r.id,
    note: r.note,
    status: r.status,
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function deleteNote(id: string) {
  await ensureTable();
  await getPool().query(`DELETE FROM listing_notes WHERE id = $1`, [id]);
}
