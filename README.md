# SNORT: Breathing life into machine-readable files

The Bimodal Project Coordinator for Humans and their AI Secretaries.

SNORT is an intentionally unpolished, "loud," and high-utility file manager designed to bridge the gap between human prose and agentic execution.
It treats documentation as a dual-entity: a human-friendly Markdown interface on the left and a high-fidelity JSON-LD/MCP resource on the backend.

Built for the "glitchy" reality of human-agent collaboration, SNORT acts as a virtual secretary that ensures every file update is grounded, validated, and 100% traceable via unique block-level IDs.

## The SNORT Manifesto

- Messy but Efficient: Heavy borders. Monospaced fonts. Terminal Green.
- Bimodal UI: Humans read Markdown; Agents read the `@id` tags and JSON Schema.
- Rules of the Road: Hard boundaries defined in `AGENTS.md` and discovery powered by `llms.txt`.
- No Hallucinations: If the LLM proposes an edit that breaks the template schema, SNORT snorts (validates and rejects).

## Core Tech Specs

- Bimodal Sync: Pairing Rule Templates (JSON Schema) with Implementation Topics (Markdown).
- The "Secretary" Logic: Uses the Model Context Protocol (MCP) to expose files as URI-addressable resources (for example `file:///topics/roadmap.md`).
- Multi-Agent State: Powered by CRDTs (Yjs/Automerge) to ensure convergence across concurrent edits.
- Block-Level Tracking: Every paragraph is an object with a persistent identifier, enabling a granular, tabular history of "Who did what and why."

## The SNORT Roadmap (Phased Deployment)

### PHASE N: THE LITTER BOX (Core Management)

- Tabular Change History: A grid-view for 100% accountability.
  - Fields: Block_ID, Timestamp, Snorter_ID, Action, Summary.
- File Explorer: Select a Topic (e.g., "Vendor Evaluation") and SNORT automatically pins the associated Template (the rules) for the agent to follow.
- Self-Hosted Chatbot: An integrated LLM "Secretary" that proposes edits via tool-calls validated against the Template Schema.

### PHASE N+1: THE DOG PARK (Collaboration)

- Multi-Snorter Editing: Real-time presence indicators and cursors for human and agent collaborators using Yjs.
- Presence Sync: See where your AI agents are currently "thinking" within the doc.

### PHASE N+2: THE KENNEL CLUB (Enterprise Integration)

- Microsoft Graph Ingestion: Pulling Teams meeting transcripts directly into the context window to automate note-to-file conversions.
- Azure AD / RBAC: Handover of security to enterprise-grade groups; agents operate under the "Principle of Least Privilege."

### PHASE N+10: TOTAL SNORT (Autonomous Agency)

- Autonomous File Management: Agents discover site boundaries via `llms.txt` and independently maintain documentation hierarchies without human prompts.

## Branding Spec (For UI/UX)

- Visuals: Low-fidelity Paint-style line art. A Pug in a VR headset.
- Color Palette:
  - Cardboard Brown (`#966F33`) (Layout/Containers)
  - Safety Orange (`#FF6600`) (Alerts/Active Cursors)
  - Terminal Green (`#00FF41`) (Text/Code blocks)
- UI Vibes: "Heavy" borders (3px+), monospaced everything, and a UI that feels like a specialized tool you’d find in a server room in 1994.
- Slogan: `Snort: Because your machine-readable files shouldn't be a black box. 🐽`

## Architecture (short)

- **`apps/web`**: Vite + React + Monaco; proxies `/api` to the server in dev; connects to Yjs over WebSocket for collaborative editing.
- **`apps/server`**: TypeScript + Express API for topics, template validation (Ajv + schemas in `/templates`), change history in `/history/tracker.json`, optional MCP stdio, and a small Yjs socket server. `createApp()` exposes the HTTP app without listening (used in tests).
- **`/topics`**: Human-facing Markdown source of truth (see `AGENTS.md` for edit rules).

## The “Happy Pug” persona (feedback model)

SNORT is meant to feel like a secretary with personality, not a silent pipe:

- **Happy snorts**: Positive, plain-language confirmation when saves succeed, validation passes, or a workflow completes without drama.
- **Snorts (alerts)**: Direct, actionable copy when something is wrong—missing files, bad topic names, missing `block_id`, or schema mismatch—without dumping stack traces to the UI.

API errors return JSON shaped like `{ "ok": false, "error": "...", "code": "..." }` when the server uses `HttpError`, so the web UI can show the same messages you would surface to an agent.

## Configuration

| Variable | Where | Purpose |
|----------|--------|---------|
| `PORT` | Server | HTTP API port (default `5174`). |
| `YJS_PORT` | Server | Yjs WebSocket port (default `1234`). |
| `MCP_STDIO` | Server | Set to `1` to run the MCP server over stdio in the same process. |
| `VITE_YJS_WS_URL` | Web (`.env`) | WebSocket URL for Yjs if not using `ws://localhost:1234`. |

## Testing

```bash
npm test
npm run typecheck
```

`npm test` runs the server suite via `tsx` (block IDs, `diffBlocks`, frontmatter / validation against the repo topic, and Supertest HTTP checks). `npm run typecheck` typechecks **both** web and server. Use `npm run lint` in `apps/web` for ESLint.

## Quickstart

Prereqs: Node.js 20+

```bash
npm install
npm run dev
```

`npm run dev` at the repo root runs the web and server workspaces. The server uses **`tsx watch`** on TypeScript sources.

Production-style server run (after compile):

```bash
npm run build:server
npm run start --workspace @arfm/server
```

Web UI: `http://localhost:5173`  
API server: `http://localhost:5174`  
Yjs WebSocket: `ws://localhost:1234` (override in the web app with `VITE_YJS_WS_URL` if needed)

