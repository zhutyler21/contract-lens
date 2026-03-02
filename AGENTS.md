# Repository Guidelines

## Project Structure & Module Organization
This project is a Word contract-review Office Add-in (per `plan.md`). Use this layout when adding code:

- `manifest.xml`: Office Add-in manifest.
- `src/taskpane/`: task pane UI and logic (`taskpane.html`, `taskpane.js`, `taskpane.css`) plus modules such as `config.js`, `api.js`, `reviewer.js`, and `comment.js`.
- `src/commands/`: Ribbon command handlers.
- `src/assets/`: icons and static assets.
- `config/settings.json`: local runtime configuration.
- `logs/error.log`: runtime error logging.

Keep modules small and focused (API, review logic, comments, export, mocks).

## Build, Test, and Development Commands
Run from repository root:

- `npm install`: install dependencies.
- `npm run dev`: start local Vite dev server for task pane development.
- `npm run build`: create production bundle.
- `npm run lint`: run lint checks (if script is present).
- `npm test`: run automated tests (if script is present).

## Coding Style & Naming Conventions
- JavaScript/HTML/CSS only unless a migration is approved.
- Use 2-space indentation and semicolons in JavaScript.
- Use `camelCase` for variables/functions, `PascalCase` for class-like constructs, and kebab-case for asset filenames.
- Keep user-facing text consistent with contract-review terminology.
- Prefer small reusable helpers in `utils.js`.

## Testing Guidelines
- Add unit tests for parsing, risk mapping, and JSON response handling.
- Add integration-style checks for Office task pane workflows where feasible.
- Name tests `*.test.js` and place them near source or in `tests/`.
- Validate critical paths: timeout/retry behavior, paragraph indexing, and comment formatting.

## Commit & Pull Request Guidelines
Git history is unavailable in this checkout, so follow Conventional Commits:
- `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, `test: ...`

PRs should include what changed and why, linked issue/task (if any), test evidence (`npm test`, manual Office checks), and screenshots for task pane UI changes.

## Security & Configuration Tips
- Never commit API keys or real contract data.
- Treat `config/settings.json` as local-sensitive configuration.
- Mask secrets in logs and screenshots.
- Use mock mode for demos and offline validation.
