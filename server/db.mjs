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
      reconnectWindowMs INTEGER,
      resumeValidUntilMs INTEGER,
      lastAckSequence INTEGER,
      lastAckTimestamp TEXT,
      lastAckEventId TEXT,
      provider TEXT,
      providerRoomId TEXT,
      providerParticipantId TEXT,
      providerCallId TEXT,
      metadataJson TEXT,
      lastError TEXT,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      startedAtMs INTEGER,
      endedAtMs INTEGER,
      failedAtMs INTEGER
    );

    CREATE TABLE IF NOT EXISTS realtime_event (
      eventId TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      actorJson TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      version TEXT NOT NULL,
      createdAtMs INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS realtime_checkpoint (
      sessionId TEXT NOT NULL,
      consumerId TEXT NOT NULL,
      watermarkTimestamp TEXT NOT NULL,
      watermarkEventId TEXT NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      PRIMARY KEY (sessionId, consumerId)
    );

    CREATE INDEX IF NOT EXISTS idx_message_conv_ts ON message(conversationId, tsMs);
codex/add-backend-entities-and-logging-features

    CREATE TABLE IF NOT EXISTS call_session (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      userId TEXT,
      route TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      startedAtMs INTEGER NOT NULL,
      endedAtMs INTEGER,
      internalDurationMs INTEGER,
      providerDurationMs INTEGER,
      status TEXT NOT NULL,
      metadataJson TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_call_session_conversation ON call_session(conversationId, startedAtMs);
    CREATE INDEX IF NOT EXISTS idx_call_session_status ON call_session(status, startedAtMs);

    CREATE TABLE IF NOT EXISTS usage_interval (
      id TEXT PRIMARY KEY,
      callSessionId TEXT NOT NULL,
      usageType TEXT NOT NULL,
      source TEXT NOT NULL,
      startAtMs INTEGER NOT NULL,
      endAtMs INTEGER NOT NULL,
      quantityMs INTEGER NOT NULL,
      unitCostCents REAL NOT NULL,
      costCents REAL NOT NULL,
      metadataJson TEXT,
      createdAtMs INTEGER NOT NULL,
      FOREIGN KEY (callSessionId) REFERENCES call_session(id)
    );

    CREATE INDEX IF NOT EXISTS idx_usage_interval_session ON usage_interval(callSessionId, startAtMs);

    CREATE TABLE IF NOT EXISTS rating_rule (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      usageType TEXT NOT NULL,
      unit TEXT NOT NULL,
      unitCostCents REAL NOT NULL,
      warningThresholdCents REAL,
      hardStopThresholdCents REAL,
      effectiveFromMs INTEGER NOT NULL,
      effectiveToMs INTEGER,
      isActive INTEGER NOT NULL DEFAULT 1,
      metadataJson TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_rating_rule_active ON rating_rule(usageType, isActive, effectiveFromMs);

    CREATE TABLE IF NOT EXISTS invoice_record (
      id TEXT PRIMARY KEY,
      invoiceNumber TEXT NOT NULL,
      periodStartMs INTEGER NOT NULL,
      periodEndMs INTEGER NOT NULL,
      status TEXT NOT NULL,
      subtotalCents REAL NOT NULL,
      adjustmentsCents REAL NOT NULL,
      totalCents REAL NOT NULL,
      providerDurationMs INTEGER,
      internalDurationMs INTEGER,
      createdAtMs INTEGER NOT NULL,
      finalizedAtMs INTEGER,
      metadataJson TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_number ON invoice_record(invoiceNumber);

    CREATE TABLE IF NOT EXISTS billing_adjustment (
      id TEXT PRIMARY KEY,
      invoiceRecordId TEXT NOT NULL,
      adjustmentType TEXT NOT NULL,
      amountCents REAL NOT NULL,
      reason TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      createdAtMs INTEGER NOT NULL,
      metadataJson TEXT,
      FOREIGN KEY (invoiceRecordId) REFERENCES invoice_record(id)
    );

    CREATE INDEX IF NOT EXISTS idx_adjustment_invoice ON billing_adjustment(invoiceRecordId, createdAtMs);

    CREATE TABLE IF NOT EXISTS billing_audit_event (
      id TEXT PRIMARY KEY,
      eventType TEXT NOT NULL,
      callSessionId TEXT,
      invoiceRecordId TEXT,
      occurredAtMs INTEGER NOT NULL,
      actor TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      FOREIGN KEY (callSessionId) REFERENCES call_session(id),
      FOREIGN KEY (invoiceRecordId) REFERENCES invoice_record(id)
    );

    CREATE INDEX IF NOT EXISTS idx_billing_audit_occurred ON billing_audit_event(occurredAtMs);
=======
    CREATE INDEX IF NOT EXISTS idx_action_audit_action_call_ts ON action_audit(actionId, callTimestampMs);
    CREATE INDEX IF NOT EXISTS idx_call_session_user_created ON call_session(userId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_call_session_status_updated ON call_session(status, updatedAtMs);
    CREATE INDEX IF NOT EXISTS idx_realtime_event_session_ts_id ON realtime_event(sessionId, timestamp, eventId);
    CREATE INDEX IF NOT EXISTS idx_realtime_event_session_sequence ON realtime_event(sessionId, sequence);
prod
  `);

  try { db.exec('ALTER TABLE call_session ADD COLUMN providerRoomId TEXT;'); } catch {}
  try { db.exec('ALTER TABLE call_session ADD COLUMN providerParticipantId TEXT;'); } catch {}
  try { db.exec('ALTER TABLE call_session ADD COLUMN providerCallId TEXT;'); } catch {}
  try { db.exec('ALTER TABLE call_session ADD COLUMN reconnectWindowMs INTEGER;'); } catch {}
  try { db.exec('ALTER TABLE call_session ADD COLUMN resumeValidUntilMs INTEGER;'); } catch {}
  try { db.exec('ALTER TABLE call_session ADD COLUMN lastAckSequence INTEGER;'); } catch {}
  try { db.exec('ALTER TABLE call_session ADD COLUMN lastAckTimestamp TEXT;'); } catch {}
  try { db.exec('ALTER TABLE call_session ADD COLUMN lastAckEventId TEXT;'); } catch {}
  try { db.exec('ALTER TABLE realtime_event ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0;'); } catch {}

  const upsertConv = db.prepare(
    `INSERT INTO conversation (id, createdAtMs, updatedAtMs, defaultPersona)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updatedAtMs=excluded.updatedAtMs, defaultPersona=excluded.defaultPersona`
  );

  const insertMsg = db.prepare(
    `INSERT OR IGNORE INTO message (id, conversationId, tsMs, role, persona, content)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

 codex/add-backend-entities-and-logging-features
  const insertCallSession = db.prepare(
    `INSERT INTO call_session (
      id, conversationId, userId, route, provider, model, startedAtMs, status, metadataJson
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const closeCallSession = db.prepare(
    `UPDATE call_session
     SET endedAtMs=?, internalDurationMs=?, providerDurationMs=?, status=?
     WHERE id=?`
  );

  const insertUsageInterval = db.prepare(
    `INSERT INTO usage_interval (
      id, callSessionId, usageType, source, startAtMs, endAtMs, quantityMs,
      unitCostCents, costCents, metadataJson, createdAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertBillingAuditEvent = db.prepare(
    `INSERT INTO billing_audit_event (
      id, eventType, callSessionId, invoiceRecordId, occurredAtMs, actor, payloadJson
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const getSessionCostCents = db.prepare(
    `SELECT COALESCE(SUM(costCents), 0) AS total FROM usage_interval WHERE callSessionId=?`
  );

  const getActiveRatingRule = db.prepare(
    `SELECT id, usageType, unitCostCents, warningThresholdCents, hardStopThresholdCents
     FROM rating_rule
     WHERE usageType=? AND isActive=1
       AND effectiveFromMs <= ?
       AND (effectiveToMs IS NULL OR effectiveToMs > ?)
     ORDER BY effectiveFromMs DESC
     LIMIT 1`
  );

  const seedDefaultRatingRule = db.prepare(
    `INSERT OR IGNORE INTO rating_rule (
      id, name, usageType, unit, unitCostCents, warningThresholdCents, hardStopThresholdCents,
      effectiveFromMs, isActive, metadataJson
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  );

  const now = Date.now();
  seedDefaultRatingRule.run(
    'default-backend-wallclock-ms',
    'Default backend wall-clock metering',
    'llm_wall_clock_ms',
    'ms',
    Number(process.env.LIFE_OS_COST_PER_MS_CENTS || 0.0005),
    Number(process.env.LIFE_OS_WARNING_THRESHOLD_CENTS || 500),
    Number(process.env.LIFE_OS_HARD_STOP_THRESHOLD_CENTS || 2000),
    now,
    JSON.stringify({ managedBy: 'server/db.mjs' })
  );

  function recordBillingAudit({ eventType, callSessionId = null, invoiceRecordId = null, actor = 'backend', payload = {} }) {
    const tsMs = Date.now();
    const id = stableId(eventType, callSessionId, invoiceRecordId, tsMs, JSON.stringify(payload));
    insertBillingAuditEvent.run(id, eventType, callSessionId, invoiceRecordId, tsMs, actor, JSON.stringify(payload));
  }

  function startCallSession({ conversationId, userId = null, route, provider, model = null, metadata = {} }) {
    const startedAtMs = Date.now();
    const id = stableId(conversationId, route, startedAtMs, provider);
    insertCallSession.run(
      id,
      conversationId,
      userId,
      route,
      provider,
      model,
      startedAtMs,
      'in_progress',
      JSON.stringify(metadata || {})
    );
    recordBillingAudit({ eventType: 'billing.call_session_started', callSessionId: id, payload: { route, provider, model, startedAtMs } });
    return { id, startedAtMs };
  }

  function stopCallSession({ callSessionId, startedAtMs, providerDurationMs = null, status = 'completed' }) {
    const endedAtMs = Date.now();
    const internalDurationMs = Math.max(0, endedAtMs - startedAtMs);
    closeCallSession.run(endedAtMs, internalDurationMs, providerDurationMs, status, callSessionId);
    recordBillingAudit({
      eventType: 'billing.call_session_stopped',
      callSessionId,
      payload: { endedAtMs, internalDurationMs, providerDurationMs, status },
    });
    return { endedAtMs, internalDurationMs };
  }

  function meterUsageInterval({ callSessionId, startAtMs, endAtMs, usageType = 'llm_wall_clock_ms', metadata = {} }) {
    const safeStart = toTsMs(startAtMs);
    const safeEnd = Math.max(safeStart, toTsMs(endAtMs));
    const quantityMs = Math.max(0, safeEnd - safeStart);
    const nowTs = Date.now();
    const rule = getActiveRatingRule.get(usageType, nowTs, nowTs) || {
      unitCostCents: Number(process.env.LIFE_OS_COST_PER_MS_CENTS || 0.0005),
      warningThresholdCents: Number(process.env.LIFE_OS_WARNING_THRESHOLD_CENTS || 500),
      hardStopThresholdCents: Number(process.env.LIFE_OS_HARD_STOP_THRESHOLD_CENTS || 2000),
    };
    const costCents = quantityMs * Number(rule.unitCostCents || 0);
    const usageIntervalId = stableId(callSessionId, safeStart, safeEnd, usageType, quantityMs);
    insertUsageInterval.run(
      usageIntervalId,
      callSessionId,
      usageType,
      'backend_authoritative_window',
      safeStart,
      safeEnd,
      quantityMs,
      Number(rule.unitCostCents || 0),
      costCents,
      JSON.stringify(metadata || {}),
      nowTs
    );
    const totalCostCents = Number(getSessionCostCents.get(callSessionId)?.total || 0);
    const threshold = {
      warningThresholdCents: rule.warningThresholdCents == null ? null : Number(rule.warningThresholdCents),
      hardStopThresholdCents: rule.hardStopThresholdCents == null ? null : Number(rule.hardStopThresholdCents),
    };
    const warningReached = threshold.warningThresholdCents != null && totalCostCents >= threshold.warningThresholdCents;
    const hardStopReached = threshold.hardStopThresholdCents != null && totalCostCents >= threshold.hardStopThresholdCents;

    recordBillingAudit({
      eventType: 'billing.usage_interval_recorded',
      callSessionId,
      payload: { usageIntervalId, usageType, safeStart, safeEnd, quantityMs, costCents, totalCostCents, threshold },
    });
    if (warningReached) {
      recordBillingAudit({
        eventType: 'billing.warning_threshold_reached',
        callSessionId,
        payload: { totalCostCents, warningThresholdCents: threshold.warningThresholdCents },
      });
    }
    if (hardStopReached) {
      recordBillingAudit({
        eventType: 'billing.hard_stop_threshold_reached',
        callSessionId,
        payload: { totalCostCents, hardStopThresholdCents: threshold.hardStopThresholdCents },
      });
    }
    return { usageIntervalId, quantityMs, costCents, totalCostCents, warningReached, hardStopReached, threshold };
  }

  return { db, upsertConv, insertMsg, dbFile, startCallSession, stopCallSession, meterUsageInterval, recordBillingAudit };
=======
  const insertActionAudit = db.prepare(
    `INSERT OR IGNORE INTO action_audit (
      id, actionId, conversationId, callTimestampMs, decisionTimestampMs,
      actionName, riskTier, decision, result, detailsJson
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertCallSession = db.prepare(
    `INSERT OR IGNORE INTO call_session (
      id, userId, status, correlationId, resumeToken, reconnectWindowMs, resumeValidUntilMs, lastAckSequence, lastAckTimestamp, lastAckEventId, provider, providerRoomId, providerParticipantId, providerCallId,
      metadataJson, lastError, createdAtMs, updatedAtMs, startedAtMs, endedAtMs, failedAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
           resumeValidUntilMs = ?,
           lastAckSequence = ?,
           lastAckTimestamp = ?,
           lastAckEventId = ?,
           provider = ?,
           providerRoomId = ?,
           providerParticipantId = ?,
           providerCallId = ?,
           metadataJson = ?,
           lastError = ?,
           updatedAtMs = ?,
           startedAtMs = ?,
           endedAtMs = ?,
           failedAtMs = ?
     WHERE id = ?`
  );

  const updateCallSessionAck = db.prepare(
    `UPDATE call_session
       SET lastAckSequence = ?,
           lastAckTimestamp = ?,
           lastAckEventId = ?,
           updatedAtMs = ?
     WHERE id = ?`
  );

  const insertRealtimeEvent = db.prepare(
    `INSERT OR IGNORE INTO realtime_event (
      eventId, sessionId, sequence, timestamp, type, actorJson, payloadJson, version, createdAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const getRealtimeSessionMaxSequence = db.prepare(
    `SELECT COALESCE(MAX(sequence), 0) AS maxSequence
       FROM realtime_event
      WHERE sessionId = ?`
  );

  const listRealtimeEventsAfterSequence = db.prepare(
    `SELECT * FROM realtime_event
      WHERE sessionId = ?
        AND sequence > ?
      ORDER BY sequence ASC
      LIMIT ?`
  );

  const listRealtimeEventsAfterWatermark = db.prepare(
    `SELECT * FROM realtime_event
      WHERE sessionId = ?
        AND (timestamp > ? OR (timestamp = ? AND eventId > ?))
      ORDER BY timestamp ASC, eventId ASC
      LIMIT ?`
  );

  const upsertRealtimeCheckpoint = db.prepare(
    `INSERT INTO realtime_checkpoint (
      sessionId, consumerId, watermarkTimestamp, watermarkEventId, updatedAtMs
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(sessionId, consumerId)
    DO UPDATE SET
      watermarkTimestamp = excluded.watermarkTimestamp,
      watermarkEventId = excluded.watermarkEventId,
      updatedAtMs = excluded.updatedAtMs`
  );

  const getRealtimeCheckpoint = db.prepare(
    `SELECT * FROM realtime_checkpoint WHERE sessionId = ? AND consumerId = ?`
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
    updateCallSessionAck,
    insertRealtimeEvent,
    getRealtimeSessionMaxSequence,
    listRealtimeEventsAfterSequence,
    listRealtimeEventsAfterWatermark,
    upsertRealtimeCheckpoint,
    getRealtimeCheckpoint,
    dbFile,
  };
 prod
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
