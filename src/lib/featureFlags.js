const normalizeFlag = (value) => String(value ?? '').trim().toLowerCase();

const isEnabled = (value) => {
  const normalized = normalizeFlag(value);
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

export const isLegacyBase44PagesEnabled = isEnabled(
  import.meta.env.VITE_ENABLE_LEGACY_BASE44_PAGES ?? import.meta.env.VITE_ENABLE_LEGACY_PAGES
);

export const isActionApprovalDebugVisible = isEnabled(import.meta.env.VITE_SHOW_ACTION_APPROVAL_DEBUG);
