# Changelog

All notable changes to this project are documented here. The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Server: `logger.js` and `httpErrors.js` with `HttpError`, `asyncHandler`, and JSON error responses (`{ ok, error, code }`).
- Server: Graceful `readTracker()` when `history/tracker.json` is missing; `appendEvents` ensures `history/` exists.
- Server: Clear validation message when a topic references a template file that is not on disk under `/templates/`.
- Web: Parses API error JSON for human-readable messages (including optional `code`).
- Web: Topic loading indicator, post-save “happy snort” confirmation, and actionable assistant/apply errors.
- Web: `VITE_YJS_WS_URL` for non-default Yjs WebSocket hosts (see README).
- Web: `typescript`, `typescript-eslint`, `typecheck` script, and stricter `tsconfig` flags (`noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`).
- Tests: Node.js built-in test runner for `blockIds` (`ensureBlockIds`, `extractBlocks`).

### Changed

- Server log line on listen now identifies SNORT and uses ISO timestamps.
- Yjs server logs when the collaboration socket is listening.
- MCP `propose_edit` tool returns structured error content when the proposal helper rejects input.

### Removed

- Unused `nanoid` dependency from `@arfm/server`.

### Security

- Ran `npm audit fix` for transitive issues where safe automatic resolution was available. Remaining moderate findings come from `monaco-editor` → `dompurify`; track upstream Monaco releases for fixes.
