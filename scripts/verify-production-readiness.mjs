import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'docs/production-readiness/PRODUCTION_READINESS_LAYER.md',
  'docs/production-readiness/MVP_SELLABILITY_CONTRACT.md',
  'docs/production-readiness/SLOS_RELEASE_GATES.md',
  'docs/production-readiness/OBSERVABILITY_INCIDENTS.md',
  'docs/production-readiness/SECURITY_DATA_GOVERNANCE.md',
  'docs/production-readiness/BILLING_TRACEABILITY.md',
  'docs/production-readiness/ONBOARDING_COMMERCIAL_SUPPORT.md',
  'docs/runbooks/LIVE_CALL_INCIDENT_RESPONSE.md',
  'docs/releases/LATEST_EVIDENCE_BUNDLE.md',
  'docs/REVIEW_MODE_CHECKLIST.md',
];

const requiredEvidenceHeadings = [
  '## Change Summary',
  '## Risks',
  '## Verification Evidence',
  '## Rollback Plan',
  '## Sign-off',
];

const requiredChecklistSection = 'Gate 6';

async function ensureExists(filePath) {
  await access(path.join(root, filePath));
}

async function main() {
  const errors = [];

  for (const filePath of requiredFiles) {
    try {
      await ensureExists(filePath);
    } catch {
      errors.push(`Missing required file: ${filePath}`);
    }
  }

  try {
    const evidence = await readFile(path.join(root, 'docs/releases/LATEST_EVIDENCE_BUNDLE.md'), 'utf8');
    for (const heading of requiredEvidenceHeadings) {
      if (!evidence.includes(heading)) {
        errors.push(`Evidence bundle missing heading: ${heading}`);
      }
    }
  } catch {
    errors.push('Unable to read evidence bundle file');
  }

  try {
    const checklist = await readFile(path.join(root, 'docs/REVIEW_MODE_CHECKLIST.md'), 'utf8');
    if (!checklist.includes(requiredChecklistSection)) {
      errors.push(`Review checklist missing required section: ${requiredChecklistSection}`);
    }
  } catch {
    errors.push('Unable to read review mode checklist file');
  }

  if (errors.length > 0) {
    console.error('Production readiness verification failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Production readiness verification passed.');
}

main().catch((err) => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
