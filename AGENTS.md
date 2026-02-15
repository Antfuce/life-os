AGENTS.md — Multi‑Agent Collaboration
Protocol for Life‑OS
This file defines how humans, ChatGPT, Codex, Base44 and OpenClaw collaborate inside this repository.
This repo is the shared brain of the project. All agents must read this file before making changes.
🧭 Project Mission
MVP Promise:
Live call → Realtime orchestration → Recruitment outcomes (CV, interview prep, outreach).
Everything in this repo must support this goal.
Non‑Goals (for now): - Autonomous job applying - Concierge / Life‑OS
features - Multi‑agent experimentation unrelated to recruitment

⚡ Realtime Product Principle
All user-facing call interactions must feel live. Target sub-300ms turn-level feedback for visible UI state changes and under 1 second for orchestration updates that users can perceive during an active session. The product must maintain synchronized live state across participants and surfaces (call status, transcript, task progress, and deliverables) so users never lose conversational context.
🧠 Agent Roles
ChatGPT (Product / QA / Architect)
Responsibilities: - UX reviews - Product decisions - Task prioritisation - Writing documentation -
Red‑teaming ideas
ChatGPT does NOT push code. ChatGPT produces specs and tasks.
Codex (Cloud Developer)
Responsibilities: - Reads repo - Picks tasks from BACKLOG.md - Writes code - Runs tests - Opens Pull
Requests
Codex does NOT decide product direction. Codex implements tasks.
Base44 (Frontend Builder)
Responsibilities: - UI components - Chat interface - Deliverables panel - Interaction flows
Base44 must NOT contain business logic.
1
OpenClaw (AI Orchestrator)
Responsibilities: - LLM routing - Tool calling - Structured outputs
OpenClaw must NOT store product data. OpenClaw must NOT act as the primary backend.
OpenClaw remains the orchestration layer only: it coordinates model/tool execution and returns structured outputs. The backend owns persistent product data, business logic, and all policy/compliance checks before any action is committed or surfaced to users.
🏗️ System Architecture Contract
Frontend → Backend/API → OpenClaw
Strict rules: - Frontend NEVER calls OpenClaw directly - Frontend NEVER talks to database directly -
OpenClaw NEVER talks to database directly
Backend/API is the only integration layer.
📁 Repository Structure
Expected layout:
/docs
BACKLOG.md
ARCHITECTURE.md
ROADMAP.md
/frontend
/backend
/openclaw
Agents must respect folder boundaries.
🔁 Agent Workflow Loop
1.
2.
3.
4.
5.
6.
Read BACKLOG.md
Pick highest priority task
Implement changes
Open Pull Request
Wait for review
Update docs if architecture changed
2
🐞 Bug Handling Protocol
When a bug is found:
1.
2.
3.
4.
5.
6.
7.
Reproduce
Classify layer:
Frontend
Backend
OpenClaw
Fix in correct layer
Document in PR
📌 Coding Rules
•
•
•
•
Prefer small PRs
Write clear commit messages
Avoid large refactors unless requested
Keep prompts and routing modular
📢 Communication Rules
Agents communicate via: - Documentation - Pull Requests - GitHub Issues
Never rely on chat messages as source of truth.
🧱 Long‑Term Vision
This repository is designed to be operated by multiple AI agents. Documentation quality is critical.
If unsure, update docs first before writing code.
3
