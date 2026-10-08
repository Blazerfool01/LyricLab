# Source of truth and development workflow

Canonical repository: https://github.com/Blazerfool01/LyricLab

GitHub's `main` branch is the accepted source of truth. Workspace directories, ZIP exports, preview builds, and browser-local songs are copies or artifacts. Record lasting code and documentation changes in the repository. Local user song projects are private content and do not belong in this source repository.

## Start from the repository

```sh
git clone https://github.com/Blazerfool01/LyricLab.git lyriclab
cd lyriclab
npm ci
npm run dev
```

For later work, fetch and update your local `main` before starting a branch. Choose a short descriptive branch, such as `feat/blueprint-validation` or `fix/rhyme-estimates`. Open a pull request with what changed, why, validation, and relevant limitations. Include documentation updates when behavior or schema changes. The user may explicitly authorize other workflows.

## Checks

```sh
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:ui
```

For this managed workspace's existing Chromium, substitute:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:ui
```

GitHub Actions repeats the domain tests, production build, and browser suite. Browser tests exercise the production assets, including reopening and editing with networking disabled. CI needs internet to install build dependencies and its test browser; the application runtime does not.

## What is tracked

Track source, stable data, tests, package lock, build configuration, original third-party licenses, product and schema documentation, and reference screenshots. Rebuild `dist/` from tracked inputs; GitHub Actions stores a verified offline build as an artifact. Do not track `node_modules/`, generated test outputs, packaged archives, local projects, or credentials.

## Milestone gates

Implement each milestone in this order:

1. Domain model and invariants.
2. Declarative data.
3. Pure engines without React.
4. Meaningful tests and regression fixtures.
5. UI integration.
6. Persistence and schema impact.
7. Regression pass, including offline operation.
8. Milestone commit or release only after the Definition of Done is met.

The initial import implements v0.1 plus early tools for later milestones. The full v1.0 release gate remains open. Keep delivered behavior in README.md and planned requirements in ROADMAP.md. Schema version 1 is the current implementation format, not yet a frozen cross-application interoperability contract.

## Engine Foundation work

Stages A–H are approved in [ENGINE_FOUNDATION.md](ENGINE_FOUNDATION.md). Stage A adds type-only boundaries and fixed [legacy characterization fixtures](../src/domain/fixtures/README.md). Build compilation includes `src/domain/foundation/contracts.typecheck.ts`; these checks never run in the application. Ordinary `npm test` compares against checked-in expectations without writing them. Intentional algorithm changes require new profile fixtures and compatibility handling, not refreshing old goldens. Keep the stage's scope, checks, and remaining gates visible in the PR. Features and dataset expansion remain paused until the foundation gate passes.

## Architecture boundaries

Keep domain engines in `src/domain/`, separate from React. Treat compiled style prompts and analysis as derived output. Changes to persisted structure need validation and migration planning. Do not silently overwrite authored or locked lyrics. Keep warnings explainable and dismissible. Keep language/dialect packs declarative and testable.

The repository does not introduce cloud storage or runtime GitHub access. GitHub stores the application source and documentation; the app stores users' songs locally.
