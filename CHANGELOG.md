# Changelog

All notable changes to this project are documented here. The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Server: TypeScript source (`src/*.ts`), `tsconfig` with `NodeNext`, `createApp()` for Supertest integration tests, and scripts `build`, `typecheck`, `dev` (`tsx watch`), `start` (`node dist/index.js`).
- Server: `logger.ts`, `httpErrors.ts` with `HttpError`, `asyncHandler`, and JSON error responses (`{ ok, error, code }`).
- Server: Graceful `readTracker()` when `history/tracker.json` is missing; `appendEvents` ensures `history/` exists.
- Server: Clear validation message when a topic references a template file that is not on disk under `/templates/`.
- Server tests: `history.test.ts` (`diffBlocks`), `topicFormat.test.ts` (frontmatter + real `vendor-evaluation.md` validation), `api.test.ts` (topics, history, 404, chat validation), `blockIds.test.ts`.
- Web: Parses API error JSON for human-readable messages (including optional `code`).
- Web: Topic loading indicator, post-save “happy snort” confirmation, and actionable assistant/apply errors.
- Web: `VITE_YJS_WS_URL` for non-default Yjs WebSocket hosts (see README).
- Web: `typescript`, `typescript-eslint`, `typecheck` script, stricter `tsconfig` flags, and direct `monaco-editor` pin alongside `@monaco-editor/react`.
- Repo `.gitignore` entries for `dist`, `apps/web/dist`, env files, and logs.

### Changed

- Root `typecheck` runs both `@arfm/web` and `@arfm/server`.
- Server log line on listen identifies SNORT with ISO timestamps; Yjs server logs when the collaboration socket is listening.
- MCP `propose_edit` tool returns structured error content when the proposal helper rejects input.

### Removed

- Unused `nanoid` and unused `remark` / `remark-parse` / `y-websocket` dependencies from `@arfm/server`.

### Security

- Ran `npm audit fix` where safe automatic resolution was available. Remaining moderate findings come from `monaco-editor` → `dompurify`; track upstream Monaco releases (pinning `monaco-editor` does not yet clear the advisory).
