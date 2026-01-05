# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

- logos is an Electron-based desktop code editor built with Vue 3, featuring Monaco Editor integration, an integrated terminal with PTY support, and a Material Design UI (MDUI).

## Development Commands

```bash
# Install dependencies (includes native module rebuild for node-pty)
npm install

# Start development server with hot reload
npm run dev

# Type checking only (no emit)
npm run typecheck

# Lint and auto-fix
npm run lint

# Production build (type check + Vite build + Electron packager)
npm run build
```

## Architecture

### Process Model (Electron)

**Main Process** (`electron/main.ts`):
- Window management and lifecycle
- Registers IPC handlers for all backend services
- Coordinates cleanup on app exit

**Preload Script** (`electron/preload.ts`):
- Exposes `window.electronAPI` to renderer via context bridge
- Provides typed interfaces for file system, Git, and terminal operations
- All IPC communication flows through this bridge

**Renderer Process** (`src/`):
- Vue 3 application with Pinia state management
- Uses MDUI web components (prefix: `mdui-`)

### Backend Services (`electron/services/`)

| Service | File | Purpose |
|---------|------|---------|
| File System | `fileService.ts` | File/directory operations, file watching |
| Git | `gitService.ts` | Git operations via CLI wrappers |
| Terminal | `terminalService.ts` | PTY management with node-pty |

### Frontend State (`src/stores/`)

| Store | Purpose |
|-------|---------|
| `editor` | Tab management, cursor positions, dirty state |
| `fileExplorer` | Directory tree, file selection |
| `git` | Branch info, staged/unstaged changes |
| `terminal` | Terminal session state |
| `theme` | Light/dark mode toggle |
| `devops` | CI/CD dashboard state |

### Key UI Components

- `src/App.vue` - Main layout: activity bar, sidebar, content area, status bar
- `src/components/FileExplorer/` - File tree with context menus
- `src/components/Git/` - Git panel (staging, commits, branches)
- `src/views/EditorView.vue` - Monaco Editor integration
- `src/views/TerminalView.vue` - xterm.js terminal

## IPC Communication Pattern

All renderer-to-main communication uses the `window.electronAPI` object:
- `window.electronAPI.fileSystem.*` - File operations
- `window.electronAPI.git.*` - Git operations
- `window.electronAPI.terminal.*` - Terminal operations
- `window.electronAPI.feedback.*` - Feedback reporting

Example: `await window.electronAPI.fileSystem.readFile(path)`

## Telemetry & Error Reporting

The app uses Sentry for error tracking and session replay:

**Main Process** (`electron/main.ts`):
- Initializes Sentry with DSN
- Handles feedback IPC for collecting system state and heap snapshots

**Renderer Process** (`src/main.ts`):
- Initializes Sentry with Session Replay integration
- Sample rates: 10% for normal sessions, 100% for error sessions

**Manual Feedback Reporting**:
- Shortcut: `Cmd/Ctrl + Shift + F`
- Collects system state, heap snapshot, and submits to Sentry
- Shows dialog with option to create GitHub Issue

## MDUI Component Usage

MDUI web components are used directly in Vue templates. Configure Vue to recognize them in `vite.config.ts`:

```typescript
isCustomElement: (tag) => tag.startsWith('mdui-')
```

Icons are imported individually in `src/main.ts`:
```typescript
import '@mdui/icons/folder.js'
```

## Path Alias

`@/` maps to `src/` (configured in both `tsconfig.json` and `vite.config.ts`).