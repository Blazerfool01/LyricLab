# Working on LyricLab

GitHub's `main` branch is the canonical source of truth for this standalone project. Read README.md and docs/ROADMAP.md before changing product scope.

## Product invariants

- Through v1.0 every runtime feature must work offline, without accounts, API keys, an LLM, or external runtime services.
- Every generator accepts an explicit seed; identical blueprint and seed must produce identical text.
- Domain engines remain pure and independent of React. Keep declarative packs in domain data modules with stable IDs.
- Manual writing remains first-class. Regeneration must preserve authored text and locks unless the user explicitly requests replacement.
- Analysis suggests; it does not block or silently rewrite creative choices.
- Persisted formats carry schemaVersion. Import validates input, preserves valid data, and rejects unsupported versions safely.
- LyricLab has no SonicStudio runtime dependency. Future integration uses an exported shared format.
- AI providers remain optional adapters after v1.0; no core capability may depend on them.

## Development

- Use a branch for changes after this initial import. Keep source, tests, and relevant documentation together in the same PR.
- Work in order: domain model, declarative data, pure engine, tests, UI, persistence impact, regression checks.
- Run npm test and npm run build. For critical workflows run npm run test:ui after installing Playwright Chromium.
- In an environment with system Chromium, set PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium for UI tests.
- Do not commit node_modules, dist, test outputs, local projects, credentials, or packaged archives.
- Update docs/ROADMAP.md based on evidence. Do not label the full v1.0 roadmap complete because early UI controls exist.
- No deployment, cloud sync, accounts, or vendor API integration is required for this repository.
