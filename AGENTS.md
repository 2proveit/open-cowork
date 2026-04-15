# Repository Guidelines

## Project Structure & Module Organization
Core code lives under `src/`. Use `src/main/` for the Electron main process, agent runtime, sandboxing, MCP, sessions, and remote integrations. Use `src/renderer/` for the React UI, Zustand store, hooks, and i18n resources. Shared helpers live in `src/shared/`. Keep build and packaging utilities in `scripts/`, static web assets in `public/`, and bundled app resources in `resources/`. Tests mirror the source layout in either `tests/` or `src/tests/`.

## Build, Test, and Development Commands
- `npm install`: installs dependencies, downloads the bundled Node runtime, and rebuilds native modules.
- `npm run dev`: starts the Vite + Electron dev app after rebuilding sandbox agents and MCP bundles.
- `npm run build`: performs the full production build with preflight checks and `electron-builder`.
- `npm run lint`: runs ESLint on `src/**/*.{ts,tsx}`.
- `npm run format`: formats `src/**/*.{ts,tsx,css}` with Prettier.
- `npm run typecheck`: runs `tsc --noEmit`.
- `npm run test`: starts Vitest.
- `npm run test:coverage`: runs coverage output to `coverage/`.

## Coding Style & Naming Conventions
Use TypeScript strict mode and prefer `unknown` plus type guards over `any`. Prettier enforces 2-space indentation, single quotes, semicolons, trailing commas (`es5`), and 100-character lines. Keep React components functional and hook-based. Use PascalCase for React components, camelCase for functions and variables, and descriptive kebab-case for test filenames such as `session-manager-crud.test.ts`.

## Testing Guidelines
Vitest is the test runner. Place tests beside the module under `src/tests/` or in mirrored root-level `tests/`. Name files `*.test.ts` or `*.spec.ts`. Coverage thresholds are modest but enforced in config: 30% lines/statements, 35% functions, 28% branches. Add or update tests for every `feat` and `fix`.

## Commit & Pull Request Guidelines
Commits follow Conventional Commits, for example `fix(remote): resolve Feishu WebSocket retries`. Allowed types are enforced by commitlint, and headers must stay under 100 characters. Open PRs against `dev` for normal work and `main` only for releases. Keep PRs focused, describe behavior changes, link related issues, and include screenshots or short recordings for UI changes.

## Security & Contributor Notes
Do not commit API keys, session data, or local secrets. Treat sandbox, credential storage, and remote-control code paths as high-risk areas. Route all user-facing strings through `src/renderer/i18n/` instead of hard-coding display text.
