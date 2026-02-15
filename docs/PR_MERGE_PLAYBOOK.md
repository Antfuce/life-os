# PR Merge Playbook — current open stack

## Goal
Unblock production by merging the 4 open PRs in dependency-safe order and avoiding schema/runtime drift.

## TL;DR (what to do right now)

1. Merge **#14** first (canonical event contract + persistence checks).
2. Merge **#17** second (LiveKit bridge) after rebasing it on latest `prod`.
3. Merge **#19** third (docs/runtime parity plan).
4. Merge **#9** last (billing/metering), ideally behind a feature flag.

If you can only ship two PRs today, ship **#14 + #17**.

## Suggested merge order (based on `BACKLOG.md` dependency chain)

1. **#14 — `backend/docs: align call event contract, persist session events, and add check scripts`**
   - This maps to P0 #3 (Realtime Event Schema v1) + P1 #7 (persistence scaffolding).
   - Merge first so downstream transport and docs can target one canonical contract.

2. **#17 — `Add LiveKit backend bridge and canonical call event ingestion`**
   - This maps to P0 #2 (LiveKit Session Bridge) and depends on #14’s canonical event contract.

3. **#19 — `docs: add MVP execution plan and prioritize Node runtime parity`**
   - Docs-only alignment PR; should land after the technical contract/bridge work so docs describe final merged reality.

4. **#9 — `Add backend billing entities, authoritative metering, reconciliation spec and spend guardrails`**
   - This maps to backlog items #8/#9/#10 and should land last because billing consumes stable call/event/persistence data.

---

## Why merges are likely blocked
Common blockers for this exact stack:

- **Out-of-date base branch**: each PR was opened quickly and likely diverged from latest `prod`.
- **Branch protection checks failing**: runtime mismatch (Node 20 vs required `node:sqlite` support) can fail CI checks.
- **Overlapping files**: event schema + bridge + billing often touch shared backend files and migration scripts.
- **Missing migration ordering**: billing/entity PRs often fail if prior schema changes were not merged first.

---

## Fast unblocking workflow (owner checklist)

For each PR in merge order:

1. Rebase onto latest `prod`.
2. Run mandatory checks with the repository’s target Node runtime.
3. Resolve file-level conflicts with **contract-first policy**:
   - keep canonical event envelope from #14,
   - adapt #17 producers to emit only canonical fields,
   - defer billing fields/events until #9.
4. Re-run checks.
5. Merge.

### Exact Git workflow (for each PR author)

```bash
# from the PR branch
git fetch origin
git rebase origin/prod

# resolve conflicts if prompted, then:
git add <resolved-files>
git rebase --continue

# run checks used by that PR (example)
npm ci
npm test

# update remote PR branch
git push --force-with-lease
```

### Exact GitHub UI review workflow (for the merger)

1. Open PR.
2. Click **Files changed** and look for conflicts in:
   - call/event schema docs and validators,
   - LiveKit ingestion handlers,
   - migrations and billing tables.
3. Confirm status checks are green.
4. Use **Squash and merge** (preferred for stacked cleanup), then delete branch.
5. Immediately open next PR in sequence and repeat.

If CI still blocks:

- Temporarily reduce to a **minimal safe slice**:
  - merge docs/spec + check scripts first,
  - merge transport ingestion second,
  - hold billing until post-deploy verification.

### If you get a specific blocker, do this

- **"This branch is out-of-date"** → click **Update branch** or rebase locally and force-push.
- **Required check failing due to Node runtime** → align CI + local to required Node version before retrying.
- **Merge conflicts in shared backend files** → keep #14 contract shape, adapt #17 emitters to it, re-run tests.
- **Billing migration conflict** → postpone #9 until #14/#17 are merged and rebased cleanly.

---

## Production hardening gates before final deploy

- Canonical event envelope validation is enabled server-side.
- LiveKit ingestion emits only accepted `call.*`/`transcript.*`/`orchestration.*` families.
- Replay/persistence path is idempotent and bounded by session watermark.
- Billing writes are behind guardrails and can be feature-flagged off if ingestion drifts.

---

## Recommended immediate action (today)

- Execute merges in this order: **#14 → #17 → #19 → #9**.
- If only two can ship today, ship **#14 + #17** to unlock realtime production path.
- Keep #9 behind a flag if runtime parity or reconciliation checks are still unstable.

## Merge-go / no-go criteria

Before pressing merge on each PR:

- **GO**: green checks + no unresolved conflicts + contract compatibility preserved.
- **NO-GO**: any schema drift, unresolved runtime parity check, or migration ambiguity.
