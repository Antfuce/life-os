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

    CREATE TABLE IF NOT EXISTS transcript_snapshot (
      snapshotId TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      utteranceId TEXT NOT NULL,
      eventId TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      speaker TEXT,
      text TEXT,
      startMs INTEGER,
      endMs INTEGER,
      payloadJson TEXT NOT NULL,
      createdAtMs INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS livekit_webhook_receipt (
      receiptId TEXT PRIMARY KEY,
      dedupeKey TEXT NOT NULL UNIQUE,
      providerEventId TEXT,
      signature TEXT NOT NULL,
      timestampMs INTEGER NOT NULL,
      bodyHash TEXT NOT NULL,
      createdAtMs INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_meter_record (
      recordId TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      meterId TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      sourceEventId TEXT NOT NULL UNIQUE,
      sourceSequence INTEGER,
      sourceTimestamp TEXT,
      signature TEXT,
      signatureVersion TEXT,
      metadataJson TEXT NOT NULL,
      createdAtMs INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_usage_event (
      billingEventId TEXT PRIMARY KEY,
      usageRecordId TEXT,
      accountId TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      eventType TEXT NOT NULL,
      meterId TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      payloadJson TEXT NOT NULL,
      createdAtMs INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_dead_letter (
      deadLetterId TEXT PRIMARY KEY,
      accountId TEXT,
      sessionId TEXT,
      eventType TEXT NOT NULL,
      eventId TEXT,
      code TEXT,
      message TEXT,
      payloadJson TEXT NOT NULL,
      createdAtMs INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_reconciliation_run (
      runId TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      windowStartMs INTEGER NOT NULL,
      windowEndMs INTEGER NOT NULL,
      expectedSummaryJson TEXT NOT NULL,
      actualSummaryJson TEXT NOT NULL,
      mismatchCount INTEGER NOT NULL,
      status TEXT NOT NULL,
      alertDispatched INTEGER NOT NULL,
      metadataJson TEXT NOT NULL,
      createdAtMs INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_reconciliation_mismatch (
      mismatchId TEXT PRIMARY KEY,
      runId TEXT NOT NULL,
      accountId TEXT NOT NULL,
      meterId TEXT NOT NULL,
      unit TEXT NOT NULL,
      expectedQuantity INTEGER NOT NULL,
      actualQuantity INTEGER NOT NULL,
      deltaQuantity INTEGER NOT NULL,
      severity TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      createdAtMs INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_reconciliation_alert (
      alertId TEXT PRIMARY KEY,
      runId TEXT NOT NULL,
      accountId TEXT NOT NULL,
      status TEXT NOT NULL,
      channel TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      maxAttempts INTEGER NOT NULL,
      nextAttemptAtMs INTEGER,
      deliveredAtMs INTEGER,
      lastError TEXT,
      createdAtMs INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenant_config (
      accountId TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      plan TEXT NOT NULL,
      maxConcurrentCalls INTEGER NOT NULL,
      flagsJson TEXT NOT NULL,
      metadataJson TEXT NOT NULL,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_memory (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_date INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS governance_audit_log (
      auditId TEXT PRIMARY KEY,
      accountId TEXT,
      actorId TEXT,
      eventType TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      createdAtMs INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_message_conv_ts ON message(conversationId, tsMs);
    CREATE INDEX IF NOT EXISTS idx_action_audit_action_call_ts ON action_audit(actionId, callTimestampMs);
    CREATE INDEX IF NOT EXISTS idx_call_session_user_created ON call_session(userId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_call_session_status_updated ON call_session(status, updatedAtMs);
    CREATE INDEX IF NOT EXISTS idx_realtime_event_session_ts_id ON realtime_event(sessionId, timestamp, eventId);
    CREATE INDEX IF NOT EXISTS idx_realtime_event_session_sequence ON realtime_event(sessionId, sequence);
    CREATE INDEX IF NOT EXISTS idx_transcript_snapshot_session_sequence ON transcript_snapshot(sessionId, sequence);
    CREATE INDEX IF NOT EXISTS idx_transcript_snapshot_session_utterance_sequence ON transcript_snapshot(sessionId, utteranceId, sequence);
    CREATE INDEX IF NOT EXISTS idx_livekit_webhook_receipt_timestamp ON livekit_webhook_receipt(timestampMs, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_usage_meter_record_session_created ON usage_meter_record(sessionId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_usage_meter_record_account_created ON usage_meter_record(accountId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_usage_meter_record_session_meter_created ON usage_meter_record(sessionId, meterId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_billing_usage_event_session_created ON billing_usage_event(sessionId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_billing_usage_event_account_created ON billing_usage_event(accountId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_billing_dead_letter_session_created ON billing_dead_letter(sessionId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_billing_dead_letter_account_created ON billing_dead_letter(accountId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_billing_reconciliation_run_account_created ON billing_reconciliation_run(accountId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_billing_reconciliation_mismatch_run ON billing_reconciliation_mismatch(runId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_billing_reconciliation_alert_run ON billing_reconciliation_alert(runId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_billing_reconciliation_alert_account ON billing_reconciliation_alert(accountId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_billing_reconciliation_alert_status_created ON billing_reconciliation_alert(status, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_billing_reconciliation_alert_status_next_attempt ON billing_reconciliation_alert(status, nextAttemptAtMs, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_tenant_config_status_updated ON tenant_config(status, updatedAtMs);
    CREATE INDEX IF NOT EXISTS idx_governance_audit_account_created ON governance_audit_log(accountId, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_governance_audit_event_created ON governance_audit_log(eventType, createdAtMs);
    CREATE INDEX IF NOT EXISTS idx_user_memory_user_created ON user_memory(userId, created_date);
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
  try { db.exec(`ALTER TABLE usage_meter_record ADD COLUMN accountId TEXT NOT NULL DEFAULT 'unknown';`); } catch {}
  try { db.exec('ALTER TABLE usage_meter_record ADD COLUMN signature TEXT;'); } catch {}
  try { db.exec('ALTER TABLE usage_meter_record ADD COLUMN signatureVersion TEXT;'); } catch {}
  try { db.exec(`ALTER TABLE billing_usage_event ADD COLUMN accountId TEXT NOT NULL DEFAULT 'unknown';`); } catch {}
  try { db.exec(`ALTER TABLE billing_usage_event ADD COLUMN eventType TEXT NOT NULL DEFAULT 'billing.usage.recorded';`); } catch {}
  try { db.exec(`ALTER TABLE billing_reconciliation_alert ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;`); } catch {}
  try { db.exec(`ALTER TABLE billing_reconciliation_alert ADD COLUMN maxAttempts INTEGER NOT NULL DEFAULT 5;`); } catch {}
  try { db.exec(`ALTER TABLE billing_reconciliation_alert ADD COLUMN nextAttemptAtMs INTEGER;`); } catch {}
  try { db.exec(`ALTER TABLE billing_reconciliation_alert ADD COLUMN deliveredAtMs INTEGER;`); } catch {}
  try { db.exec(`ALTER TABLE billing_reconciliation_alert ADD COLUMN lastError TEXT;`); } catch {}

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

  const insertTranscriptSnapshot = db.prepare(
    `INSERT OR IGNORE INTO transcript_snapshot (
      snapshotId, sessionId, utteranceId, eventId, sequence, timestamp, type,
      speaker, text, startMs, endMs, payloadJson, createdAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const listTranscriptSnapshotsBySession = db.prepare(
    `SELECT * FROM transcript_snapshot
      WHERE sessionId = ?
      ORDER BY sequence ASC
      LIMIT ?`
  );

  const listTranscriptSnapshotsBySessionAfterSequence = db.prepare(
    `SELECT * FROM transcript_snapshot
      WHERE sessionId = ?
        AND sequence > ?
      ORDER BY sequence ASC
      LIMIT ?`
  );

  const insertLiveKitWebhookReceipt = db.prepare(
    `INSERT OR IGNORE INTO livekit_webhook_receipt (
      receiptId, dedupeKey, providerEventId, signature, timestampMs, bodyHash, createdAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const insertUsageMeterRecord = db.prepare(
    `INSERT OR IGNORE INTO usage_meter_record (
      recordId, accountId, sessionId, meterId, unit, quantity, sourceEventId,
      sourceSequence, sourceTimestamp, signature, signatureVersion, metadataJson, createdAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const listUsageMeterRecordsBySession = db.prepare(
    `SELECT * FROM usage_meter_record
      WHERE sessionId = ?
      ORDER BY createdAtMs ASC
      LIMIT ?`
  );

  const listUsageMeterRecordsBySessionAndMeter = db.prepare(
    `SELECT * FROM usage_meter_record
      WHERE sessionId = ?
        AND meterId = ?
      ORDER BY createdAtMs ASC
      LIMIT ?`
  );

  const listUsageMeterRecordsByAccount = db.prepare(
    `SELECT * FROM usage_meter_record
      WHERE accountId = ?
      ORDER BY createdAtMs ASC
      LIMIT ?`
  );

  const summarizeUsageByAccount = db.prepare(
    `SELECT meterId, unit, COALESCE(SUM(quantity), 0) AS totalQuantity, COUNT(*) AS recordsCount
      FROM usage_meter_record
      WHERE accountId = ?
      GROUP BY meterId, unit
      ORDER BY meterId ASC, unit ASC`
  );

  const insertBillingUsageEvent = db.prepare(
    `INSERT OR IGNORE INTO billing_usage_event (
      billingEventId, usageRecordId, accountId, sessionId, eventType, meterId, unit, quantity, payloadJson, createdAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const listBillingUsageEventsBySession = db.prepare(
    `SELECT * FROM billing_usage_event
      WHERE sessionId = ?
      ORDER BY createdAtMs ASC
      LIMIT ?`
  );

  const listBillingUsageEventsByAccount = db.prepare(
    `SELECT * FROM billing_usage_event
      WHERE accountId = ?
      ORDER BY createdAtMs ASC
      LIMIT ?`
  );

  const insertBillingDeadLetter = db.prepare(
    `INSERT OR IGNORE INTO billing_dead_letter (
      deadLetterId, accountId, sessionId, eventType, eventId, code, message, payloadJson, createdAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const listBillingDeadLettersBySession = db.prepare(
    `SELECT * FROM billing_dead_letter
      WHERE sessionId = ?
      ORDER BY createdAtMs ASC
      LIMIT ?`
  );

  const listBillingDeadLettersByAccount = db.prepare(
    `SELECT * FROM billing_dead_letter
      WHERE accountId = ?
      ORDER BY createdAtMs ASC
      LIMIT ?`
  );

  const summarizeUsageByAccountWindow = db.prepare(
    `SELECT meterId, unit, COALESCE(SUM(quantity), 0) AS totalQuantity, COUNT(*) AS recordsCount
      FROM usage_meter_record
      WHERE accountId = ?
        AND createdAtMs >= ?
        AND createdAtMs < ?
      GROUP BY meterId, unit
      ORDER BY meterId ASC, unit ASC`
  );

  const summarizeBillingByAccountWindow = db.prepare(
    `SELECT meterId, unit, COALESCE(SUM(quantity), 0) AS totalQuantity, COUNT(*) AS recordsCount
      FROM billing_usage_event
      WHERE accountId = ?
        AND createdAtMs >= ?
        AND createdAtMs < ?
      GROUP BY meterId, unit
      ORDER BY meterId ASC, unit ASC`
  );

  const insertBillingReconciliationRun = db.prepare(
    `INSERT OR IGNORE INTO billing_reconciliation_run (
      runId, accountId, windowStartMs, windowEndMs, expectedSummaryJson,
      actualSummaryJson, mismatchCount, status, alertDispatched, metadataJson, createdAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const getBillingReconciliationRunById = db.prepare(
    `SELECT * FROM billing_reconciliation_run WHERE runId = ?`
  );

  const listBillingReconciliationRunsByAccount = db.prepare(
    `SELECT * FROM billing_reconciliation_run
      WHERE accountId = ?
      ORDER BY createdAtMs DESC
      LIMIT ?`
  );

  const insertBillingReconciliationMismatch = db.prepare(
    `INSERT OR IGNORE INTO billing_reconciliation_mismatch (
      mismatchId, runId, accountId, meterId, unit, expectedQuantity,
      actualQuantity, deltaQuantity, severity, payloadJson, createdAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const listBillingReconciliationMismatchesByRun = db.prepare(
    `SELECT * FROM billing_reconciliation_mismatch
      WHERE runId = ?
      ORDER BY createdAtMs ASC
      LIMIT ?`
  );

  const insertBillingReconciliationAlert = db.prepare(
    `INSERT OR IGNORE INTO billing_reconciliation_alert (
      alertId, runId, accountId, status, channel, payloadJson,
      attempts, maxAttempts, nextAttemptAtMs, deliveredAtMs, lastError, createdAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const listBillingReconciliationAlertsByRun = db.prepare(
    `SELECT * FROM billing_reconciliation_alert
      WHERE runId = ?
      ORDER BY createdAtMs ASC
      LIMIT ?`
  );

  const listBillingReconciliationAlertsByAccount = db.prepare(
    `SELECT * FROM billing_reconciliation_alert
      WHERE accountId = ?
      ORDER BY createdAtMs DESC
      LIMIT ?`
  );

  const listBillingReconciliationPendingAlerts = db.prepare(
    `SELECT * FROM billing_reconciliation_alert
      WHERE status = 'pending'
        AND (nextAttemptAtMs IS NULL OR nextAttemptAtMs <= ?)
      ORDER BY createdAtMs ASC
      LIMIT ?`
  );

  const updateBillingReconciliationAlertStatus = db.prepare(
    `UPDATE billing_reconciliation_alert
       SET status = ?
     WHERE alertId = ?`
  );

  const updateBillingReconciliationAlertDelivery = db.prepare(
    `UPDATE billing_reconciliation_alert
       SET status = ?,
           deliveredAtMs = ?,
           lastError = NULL
     WHERE alertId = ?`
  );

  const updateBillingReconciliationAlertRetry = db.prepare(
    `UPDATE billing_reconciliation_alert
       SET status = ?,
           attempts = ?,
           nextAttemptAtMs = ?,
           lastError = ?
     WHERE alertId = ?`
  );

  const listBillingReconciliationAccountsByWindow = db.prepare(
    `SELECT accountId FROM (
      SELECT accountId
      FROM usage_meter_record
      WHERE createdAtMs >= ?
        AND createdAtMs < ?
      UNION
      SELECT accountId
      FROM billing_usage_event
      WHERE createdAtMs >= ?
        AND createdAtMs < ?
    )
    ORDER BY accountId ASC
    LIMIT ?`
  );

  const findBillingReconciliationRunByAccountWindow = db.prepare(
    `SELECT * FROM billing_reconciliation_run
      WHERE accountId = ?
        AND windowStartMs = ?
        AND windowEndMs = ?
      ORDER BY createdAtMs DESC
      LIMIT 1`
  );

  const upsertTenantConfig = db.prepare(
    `INSERT INTO tenant_config (
      accountId, status, plan, maxConcurrentCalls, flagsJson, metadataJson, createdAtMs, updatedAtMs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(accountId)
    DO UPDATE SET
      status = excluded.status,
      plan = excluded.plan,
      maxConcurrentCalls = excluded.maxConcurrentCalls,
      flagsJson = excluded.flagsJson,
      metadataJson = excluded.metadataJson,
      updatedAtMs = excluded.updatedAtMs`
  );

  const getTenantConfigByAccountId = db.prepare(
    `SELECT * FROM tenant_config WHERE accountId = ?`
  );

  const listTenantConfigs = db.prepare(
    `SELECT * FROM tenant_config
      ORDER BY updatedAtMs DESC
      LIMIT ?`
  );

  const insertGovernanceAuditLog = db.prepare(
    `INSERT OR IGNORE INTO governance_audit_log (
      auditId, accountId, actorId, eventType, payloadJson, createdAtMs
    ) VALUES (?, ?, ?, ?, ?, ?)`
  );

  const listGovernanceAuditByAccount = db.prepare(
    `SELECT * FROM governance_audit_log
      WHERE accountId = ?
      ORDER BY createdAtMs DESC
      LIMIT ?`
  );

  const countCallSessionsByUser = db.prepare(
    `SELECT COUNT(*) AS count FROM call_session WHERE userId = ?`
  );

  const countRealtimeEventsByUser = db.prepare(
    `SELECT COUNT(*) AS count
       FROM realtime_event
      WHERE sessionId IN (SELECT id FROM call_session WHERE userId = ?)`
  );

  const countTranscriptSnapshotsByUser = db.prepare(
    `SELECT COUNT(*) AS count
       FROM transcript_snapshot
      WHERE sessionId IN (SELECT id FROM call_session WHERE userId = ?)`
  );

  const countRealtimeCheckpointsByUser = db.prepare(
    `SELECT COUNT(*) AS count
       FROM realtime_checkpoint
      WHERE sessionId IN (SELECT id FROM call_session WHERE userId = ?)`
  );

  const countUsageMeterRecordsByAccount = db.prepare(
    `SELECT COUNT(*) AS count FROM usage_meter_record WHERE accountId = ?`
  );

  const countBillingUsageEventsByAccount = db.prepare(
    `SELECT COUNT(*) AS count FROM billing_usage_event WHERE accountId = ?`
  );

  const countBillingDeadLettersByAccount = db.prepare(
    `SELECT COUNT(*) AS count FROM billing_dead_letter WHERE accountId = ?`
  );

  const countBillingReconciliationRunsByAccount = db.prepare(
    `SELECT COUNT(*) AS count FROM billing_reconciliation_run WHERE accountId = ?`
  );

  const countBillingReconciliationMismatchesByAccount = db.prepare(
    `SELECT COUNT(*) AS count
       FROM billing_reconciliation_mismatch
      WHERE runId IN (SELECT runId FROM billing_reconciliation_run WHERE accountId = ?)`
  );

  const countBillingReconciliationAlertsByAccount = db.prepare(
    `SELECT COUNT(*) AS count FROM billing_reconciliation_alert WHERE accountId = ?`
  );

  const deleteRealtimeCheckpointsByUser = db.prepare(
    `DELETE FROM realtime_checkpoint
      WHERE sessionId IN (SELECT id FROM call_session WHERE userId = ?)`
  );

  const deleteTranscriptSnapshotsByUser = db.prepare(
    `DELETE FROM transcript_snapshot
      WHERE sessionId IN (SELECT id FROM call_session WHERE userId = ?)`
  );

  const deleteRealtimeEventsByUser = db.prepare(
    `DELETE FROM realtime_event
      WHERE sessionId IN (SELECT id FROM call_session WHERE userId = ?)`
  );

  const deleteCallSessionsByUser = db.prepare(
    `DELETE FROM call_session WHERE userId = ?`
  );

  const deleteUsageMeterRecordsByAccount = db.prepare(
    `DELETE FROM usage_meter_record WHERE accountId = ?`
  );

  const deleteBillingUsageEventsByAccount = db.prepare(
    `DELETE FROM billing_usage_event WHERE accountId = ?`
  );

  const deleteBillingDeadLettersByAccount = db.prepare(
    `DELETE FROM billing_dead_letter WHERE accountId = ?`
  );

  const deleteBillingReconciliationMismatchesByAccount = db.prepare(
    `DELETE FROM billing_reconciliation_mismatch
      WHERE runId IN (SELECT runId FROM billing_reconciliation_run WHERE accountId = ?)`
  );

  const deleteBillingReconciliationAlertsByAccount = db.prepare(
    `DELETE FROM billing_reconciliation_alert WHERE accountId = ?`
  );

  const deleteBillingReconciliationRunsByAccount = db.prepare(
    `DELETE FROM billing_reconciliation_run WHERE accountId = ?`
  );

  const deleteTenantConfigByAccountId = db.prepare(
    `DELETE FROM tenant_config WHERE accountId = ?`
  );

  const getTranscriptSnapshotStatsBySession = db.prepare(
    `SELECT
      COUNT(*) AS count,
      COALESCE(MIN(sequence), 0) AS minSequence,
      COALESCE(MAX(sequence), 0) AS maxSequence,
      MIN(timestamp) AS minTimestamp,
      MAX(timestamp) AS maxTimestamp,
      COALESCE(SUM(LENGTH(payloadJson)), 0) AS payloadBytes
     FROM transcript_snapshot
     WHERE sessionId = ?`
  );

  const compactTranscriptSnapshotsBySessionKeepLast = db.prepare(
    `DELETE FROM transcript_snapshot
      WHERE sessionId = ?
        AND sequence <= (
          SELECT CASE
            WHEN MAX(sequence) IS NULL THEN -1
            ELSE MAX(sequence) - ?
          END
          FROM transcript_snapshot
          WHERE sessionId = ?
        )`
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

  const getCallSessionByProviderCallId = db.prepare(
    `SELECT * FROM call_session WHERE providerCallId = ? ORDER BY updatedAtMs DESC LIMIT 1`
  );

  const getCallSessionByProviderRoomAndParticipant = db.prepare(
    `SELECT * FROM call_session
      WHERE providerRoomId = ?
        AND providerParticipantId = ?
      ORDER BY updatedAtMs DESC
      LIMIT 1`
  );

  const getCallSessionByProviderRoomId = db.prepare(
    `SELECT * FROM call_session
      WHERE providerRoomId = ?
      ORDER BY updatedAtMs DESC
      LIMIT 1`
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
    insertTranscriptSnapshot,
    listTranscriptSnapshotsBySession,
    listTranscriptSnapshotsBySessionAfterSequence,
    insertLiveKitWebhookReceipt,
    insertUsageMeterRecord,
    listUsageMeterRecordsBySession,
    listUsageMeterRecordsBySessionAndMeter,
    listUsageMeterRecordsByAccount,
    summarizeUsageByAccount,
    insertBillingUsageEvent,
    listBillingUsageEventsBySession,
    listBillingUsageEventsByAccount,
    insertBillingDeadLetter,
    listBillingDeadLettersBySession,
    listBillingDeadLettersByAccount,
    summarizeUsageByAccountWindow,
    summarizeBillingByAccountWindow,
    insertBillingReconciliationRun,
    getBillingReconciliationRunById,
    listBillingReconciliationRunsByAccount,
    insertBillingReconciliationMismatch,
    listBillingReconciliationMismatchesByRun,
    insertBillingReconciliationAlert,
    listBillingReconciliationAlertsByRun,
    listBillingReconciliationAlertsByAccount,
    listBillingReconciliationPendingAlerts,
    updateBillingReconciliationAlertStatus,
    updateBillingReconciliationAlertDelivery,
    updateBillingReconciliationAlertRetry,
    listBillingReconciliationAccountsByWindow,
    findBillingReconciliationRunByAccountWindow,
    upsertTenantConfig,
    getTenantConfigByAccountId,
    listTenantConfigs,
    insertGovernanceAuditLog,
    listGovernanceAuditByAccount,
    countCallSessionsByUser,
    countRealtimeEventsByUser,
    countTranscriptSnapshotsByUser,
    countRealtimeCheckpointsByUser,
    countUsageMeterRecordsByAccount,
    countBillingUsageEventsByAccount,
    countBillingDeadLettersByAccount,
    countBillingReconciliationRunsByAccount,
    countBillingReconciliationMismatchesByAccount,
    countBillingReconciliationAlertsByAccount,
    deleteRealtimeCheckpointsByUser,
    deleteTranscriptSnapshotsByUser,
    deleteRealtimeEventsByUser,
    deleteCallSessionsByUser,
    deleteUsageMeterRecordsByAccount,
    deleteBillingUsageEventsByAccount,
    deleteBillingDeadLettersByAccount,
    deleteBillingReconciliationMismatchesByAccount,
    deleteBillingReconciliationAlertsByAccount,
    deleteBillingReconciliationRunsByAccount,
    deleteTenantConfigByAccountId,
    getTranscriptSnapshotStatsBySession,
    compactTranscriptSnapshotsBySessionKeepLast,
    listRealtimeEventsAfterSequence,
    listRealtimeEventsAfterWatermark,
    upsertRealtimeCheckpoint,
    getRealtimeCheckpoint,

    getCallSessionByProviderCallId,
    getCallSessionByProviderRoomAndParticipant,
    getCallSessionByProviderRoomId,

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
