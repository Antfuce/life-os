import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const __dirname = new URL('.', import.meta.url).pathname;

export async function initDb(dbFile = path.join(__dirname, 'data', 'lifeos.db')) {
  await mkdir(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  try { db.exec('PRAGMA journal_mode = WAL;'); } catch {}
  try { db.exec('PRAGMA synchronous = NORMAL;'); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation (
      id TEXT PRIMARY KEY,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      defaultPersona TEXT
    );

    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      tsMs INTEGER NOT NULL,
      role TEXT NOT NULL,
      persona TEXT,
      content TEXT NOT NULL,
      FOREIGN KEY (conversationId) REFERENCES conversation(id)
    );

    CREATE TABLE IF NOT EXISTS action_audit (
      id TEXT PRIMARY KEY,
      actionId TEXT NOT NULL,
      conversationId TEXT,
      callTimestampMs INTEGER NOT NULL,
      decisionTimestampMs INTEGER NOT NULL,
      actionName TEXT NOT NULL,
      riskTier TEXT NOT NULL,
      decision TEXT NOT NULL,
      result TEXT NOT NULL,
      detailsJson TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_message_conv_ts ON message(conversationId, tsMs);
    CREATE INDEX IF NOT EXISTS idx_action_audit_action_call_ts ON action_audit(actionId, callTimestampMs);
  `);

  const upsertConv = db.prepare(
    `INSERT INTO conversation (id, createdAtMs, updatedAtMs, defaultPersona)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updatedAtMs=excluded.updatedAtMs, defaultPersona=excluded.defaultPersona`
  );

  const insertMsg = db.prepare(
    `INSERT OR IGNORE INTO message (id, conversationId, tsMs, role, persona, content)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const insertActionAudit = db.prepare(
    `INSERT OR IGNORE INTO action_audit (
      id, actionId, conversationId, callTimestampMs, decisionTimestampMs,
      actionName, riskTier, decision, result, detailsJson
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  return { db, upsertConv, insertMsg, insertActionAudit, dbFile };
}

export function stableId(...parts) {
  const h = crypto.createHash('sha1');
  for (const p of parts) h.update(String(p ?? ''));
  return h.digest('hex');
}

export function toTsMs(isoOrMs) {
  if (typeof isoOrMs === 'number' && Number.isFinite(isoOrMs)) return isoOrMs;
  const d = new Date(String(isoOrMs || ''));
  const t = d.getTime();
  return Number.isFinite(t) ? t : Date.now();
}
