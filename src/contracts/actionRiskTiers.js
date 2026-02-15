export const ACTION_RISK_TIERS = {
  READ_ONLY: 'read-only',
  LOW_RISK_WRITE: 'low-risk-write',
  HIGH_RISK_EXTERNAL_SEND: 'high-risk-external-send',
};

const ACTION_RISK_MAP = {
  'cv.copy': ACTION_RISK_TIERS.READ_ONLY,
  'cv.export.markdown': ACTION_RISK_TIERS.READ_ONLY,
  'outreach.copy': ACTION_RISK_TIERS.READ_ONLY,

  'cv.edit': ACTION_RISK_TIERS.LOW_RISK_WRITE,
  'interview.save': ACTION_RISK_TIERS.LOW_RISK_WRITE,
  'outreach.edit': ACTION_RISK_TIERS.LOW_RISK_WRITE,

  'outreach.requestSend': ACTION_RISK_TIERS.HIGH_RISK_EXTERNAL_SEND,
};

export function getActionRiskTier(actionName) {
  return ACTION_RISK_MAP[actionName] || ACTION_RISK_TIERS.LOW_RISK_WRITE;
}

export function isHighRiskAction(actionName) {
  return getActionRiskTier(actionName) === ACTION_RISK_TIERS.HIGH_RISK_EXTERNAL_SEND;
}

