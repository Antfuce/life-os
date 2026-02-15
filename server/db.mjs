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

    CREATE TABLE IF NOT EXISTS call_session (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      status TEXT NOT NULL,
      correlationId TEXT,
      resumeToken TEXT,
      provider TEXT,
      providerRoomName TEXT,
      metadataJson TEXT,
      lastError TEXT,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      startedAtMs INTEGER,
      endedAtMs INTEGER,
      failedAtMs INTEGER
    );

    CREATE TABLE IF NOT EXISTS call_session_event (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      tsMs INTEGER NOT NULL,
      type TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      schemaVersion TEXT NOT NULL,
      FOREIGN KEY (sessionId) REFERENCES call_session(id)
    );

    CREATE INDEX IF NOT EXISTS idx_message_conv_ts ON message(conversationId, tsMs);
    CREATE INDEX IF NOT EXISTS idx_action_audit_action_call_ts ON action_audit(actionId, callTimestampMs);
    CREATE INDEX IF NOT EXISTS idx_call_session_user_created ON call_session(userId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_call_session_status_updated ON call_session(status, updatedAtMs);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_call_session_event_session_seq ON call_session_event(sessionId, sequence);
    CREATE INDEX IF NOT EXISTS idx_call_session_event_session_ts ON call_session_event(sessionId, tsMs);
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

  const insertCallSession = db.prepare(
    `INSERT OR IGNORE INTO call_session (
      id, userId, status, correlationId, resumeToken, provider, providerRoomName,
      metadataJson, lastError, createdAtMs, updatedAtMs, startedAtMs, endedAtMs, failedAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const getCallSessionById = db.prepare(
    `SELECT * FROM call_session WHERE id = ?`
  );

  const listCallSessionsByUser = db.prepare(
    `SELECT * FROM call_session
      WHERE userId = ?
      ORDER BY createdAtMs DESC
      LIMIT ?`
  );

  const updateCallSession = db.prepare(
    `UPDATE call_session
       SET status = ?,
           provider = ?,
           providerRoomName = ?,
           metadataJson = ?,
           lastError = ?,
           updatedAtMs = ?,
           startedAtMs = ?,
           endedAtMs = ?,
           failedAtMs = ?
     WHERE id = ?`
  );

  const getLatestCallSessionSequence = db.prepare(
    `SELECT COALESCE(MAX(sequence), 0) AS maxSequence
       FROM call_session_event
      WHERE sessionId = ?`
  );

  const insertCallSessionEvent = db.prepare(
    `INSERT INTO call_session_event (
      id, sessionId, sequence, tsMs, type, payloadJson, schemaVersion
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const listCallSessionEvents = db.prepare(
    `SELECT *
       FROM call_session_event
      WHERE sessionId = ?
        AND sequence > ?
      ORDER BY sequence ASC
      LIMIT ?`
  );

  return {
    db,
    upsertConv,
    insertMsg,
    insertActionAudit,
    insertCallSession,
    getCallSessionById,
    listCallSessionsByUser,
    updateCallSession,
    getLatestCallSessionSequence,
    insertCallSessionEvent,
    listCallSessionEvents,
    dbFile,
  };
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
