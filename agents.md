# agents.md — Operational boundaries

This repository is intended for human + agent collaboration.

## Hard boundaries

- Never modify the `/templates/` folder unless explicitly instructed by the user.
- Prefer additive changes; avoid destructive edits to user content.
- All topic edits must preserve block-level integrity and persistent `@id` identifiers.

## Working conventions

- Human-facing source of truth is Markdown in `/topics/`.
- Machine-facing structure is derived and validated against a template schema in `/templates/`.
- Atomic edits are recorded in `/history/tracker.json`.

