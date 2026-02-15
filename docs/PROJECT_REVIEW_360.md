# Life-OS 360° Project Review (Codex)

Date: 2026-02-15

## Executive Take

The project has a strong MVP narrative and a working technical spike:

- Frontend + backend + OpenClaw integration exists.
- Streaming chat and a UI event contract are already in place.
- CV module foundations exist and are partially wired.

However, there are strategy and execution risks that should be corrected immediately:

1. **Backlog split-brain** (`BACKLOG.md` vs `backlog.md`) creates decision ambiguity.
2. **Mission drift** appears in lower-case backlog (`backlog.md`) where real-time voice calling is promoted, while root `AGENTS.md` marks voice calling automation as a non-goal for now.
3. **Environment portability risk** remains due to machine-specific defaults in backend config.
4. **Repo structure contract mismatch** (`/frontend`, `/backend`, `/openclaw`, `/docs`) is documented but not reflected in actual layout.

---

## What Looks Good

- **Clear product promise:** “Talk once → Generate CV → Prepare Interview → Generate Outreach.”
- **Correct architecture principle:** Frontend → Backend/API → OpenClaw.
- **Good modular direction:** UI event reducer + module registry pattern is scalable for deliverables.
- **Pragmatic known-issues docs:** status + checklist + bug template + UX rescue notes exist.

---

## Red-Team Findings

### Product & Scope Risk
- There are mixed signals about what is MVP vs post-MVP (voice/realtime lanes appear in `backlog.md`).
- “Everything supports recruitment MVP” is stated, but backlog still contains tasks that can consume major bandwidth before core value loop is complete.

### Delivery Risk
- Tunnel instability is a repeated blocker and still unresolved; this is gating reliable manual QA and confidence.
- No explicit “Definition of Done” per deliverable quality (CV completeness scoring, interview usefulness metrics, outreach safety checks).

### Security & Trust Risk
- Confirmation gates for outreach are still not fully wired end-to-end.
- Missing basic abuse controls in active path (auth/rate limiting/spend guardrails).

### Architecture/Repo Governance Risk
- Expected structure in AGENTS contract does not match repository reality, which weakens multi-agent onboarding.
- Duplicate backlog files may cause agents to execute contradictory priorities.

---

## Recommended Next 10 Tasks (Priority Order)

1. **Unify backlog source of truth**
   - Keep only one active backlog (`BACKLOG.md`), archive or deprecate `backlog.md`.
2. **Fix infra blocker permanently**
   - Stable backend origin/domain + TLS + CORS policy + health monitor.
3. **Environment hardening**
   - Remove machine-specific defaults; add `.env.example`; fail fast with actionable errors.
4. **Outreach execution gates complete**
   - Implement `confirm.required` lifecycle in UI and backend acknowledgment flow.
5. **Interview module wiring**
   - Complete `deliverable.interview` component integration and actions.
6. **CV end-to-end acceptance test runbook**
   - Formalize deterministic smoke steps and expected events.
7. **Persistence to UI hydration**
   - Load prior conversation + deliverables at startup.
8. **Auth + rate limiting baseline**
   - Basic API key/session auth + request caps + spend guardrails.
9. **Error observability package**
   - Request IDs, correlation in logs, user-friendly UI error surfaces.
10. **Repo structure alignment pass**
   - Either implement `/docs /frontend /backend /openclaw` folders or update AGENTS contract to current structure.

---

## Backlog Review Verdict

**Is the backlog correct today?**

- `BACKLOG.md`: Mostly aligned with current state and near-term MVP.
- `backlog.md`: Valuable ideas but currently too broad and partially conflicting with stated non-goals.

**Recommendation:**
- Treat `BACKLOG.md` as active sprint backlog.
- Move `backlog.md` to archive or convert into a future roadmap document after de-scoping non-MVP items.

---

## AGENTS.md Review

### Strengths
- Strong mission framing and role boundaries.
- Correct integration contract (backend is the only orchestrator).
- Good emphasis on docs and small PRs.

### Gaps to Improve
1. Add explicit **single source-of-truth docs list** (which backlog file is canonical).
2. Add **Definition of Done template** for tasks.
3. Add **PR quality checklist** (tests run, screenshots when visual change, risk notes).
4. Clarify whether current repo structure is transitional or required immediately.

---

## What We Are Building (Concise)

Life-OS is becoming a **recruitment execution copilot**:

- One conversation ingests user context.
- System outputs concrete hiring artifacts (CV, interview prep, outreach drafts).
- Safety gates prevent unintended external actions.
- Backend-owned orchestration keeps UI simple and policy-enforced.

If we keep scope tight and close infra/reliability gaps now, this can reach a credible MVP quickly.
