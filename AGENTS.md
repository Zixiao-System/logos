# Repository Guidelines

## Project Structure & Module Organization
- `src/`: Vue 3 renderer code (components, stores, views, router, styles).
- `electron/`: Electron main/preload and backend services (IPC, file system, git, terminal).
- `tests/`: Vitest setup plus unit/integration/e2e suites.
- `logos-lang/`: Rust daemon used by the app (built via `build:daemon`).
- `build/`, `resources/`, `dist*`, `release/`: packaging assets and build outputs.

## Build, Test, and Development Commands
- `npm run dev`: start Vite dev server (renderer).
- `npm run electron:dev`: Electron-focused dev mode.
- `npm run build`: typecheck, build renderer, and package Electron app.
- `npm run electron:build`: alias for `npm run build`.
- `npm run build:daemon`: build the Rust `logos-daemon`.
- `npm run lint`: run ESLint with auto-fix.
- `npm run test`: run Vitest once.
- `npm run test:watch`: watch mode.
- `npm run test:coverage`: coverage report to `coverage/`.

## Coding Style & Naming Conventions
- TypeScript + Vue SFCs; keep renderer code in `src/` and Electron logic in `electron/`.
- Use 2-space indentation in Vue/TS (matching existing code style).
- Prefer `PascalCase.vue` for components and `camelCase.ts` for modules.
- Linting via `eslint.config.mts`; format by running `npm run lint`.

## Testing Guidelines
- Framework: Vitest with `@vue/test-utils` and `happy-dom`.
- Test files live in `tests/` and follow `*.test.ts` or `*.spec.ts`.
- Coverage targets (from `tests/README.md`): Stores 80%+, Components 70%+, Services 80%, overall 75%.
- Example: `tests/unit/components/MyWidget.test.ts`.

## Commit & Pull Request Guidelines
- Commits follow Conventional Commits (e.g., `feat: ...`, `fix: ...`, `chore: ...`).
- PRs should include a clear summary, linked issue (if applicable), and screenshots for UI changes.
- Note any required follow-up (migration steps, packaging changes) in the PR description.

## Configuration & Tips
- Node.js 18+ recommended; `npm install` runs `electron-rebuild` for `node-pty`.
- App packaging is configured in `package.json` under `build`.
