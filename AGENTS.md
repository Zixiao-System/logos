# AGENTS.md

This file provides guidance for automated agents working in this repository.

## Project summary
- Logos IDE is an Electron desktop code editor built with Vue 3, Monaco Editor, and MDUI components.
- Main process: `electron/` (IPC, services, extension host, terminal, git, file system).
- Renderer: `src/` (Vue app, Pinia stores, Monaco integration, UI).

## Key directories
- `electron/`: main process, IPC handlers, services, extension host.
- `src/`: renderer (Vue 3 + Pinia), editor, panels, UI components.
- `docs/`: design docs and implementation plans.
- `scripts/`: build and dev scripts.

## Development commands
```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
```

## Extension system (current state)
- Extension host process is managed from `electron/services/extensionService.ts`.
- Extension host implementation lives under `electron/extension-host/` (loader, RPC, vscode API stub).
- Extension install/uninstall/enable/disable + marketplace search are in `electron/services/extensionService.ts`.
- Renderer-side access is through `electron/preload.ts` and `src/stores/extensions.ts`.

## Coding conventions
- TypeScript throughout; prefer small, composable functions.
- Keep IPC payloads explicit and typed.
- Avoid touching generated outputs (`dist/`, `build/`) unless required.
- Preserve existing behavior; add guardrails for stability and security changes.

## When modifying extensions
- Keep compatibility with VS Code extension manifests and activation events.
- Ensure extension host crashes do not impact the main process.
- Any new permission or safety prompt should be user-visible and persisted.
