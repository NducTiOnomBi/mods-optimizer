# Copilot Instructions — mods-optimizer

Fork of [grandivory/mods-optimizer](https://github.com/grandivory/mods-optimizer): a Star Wars Galaxy of Heroes mod optimization tool built with React 16, Redux 4, and Flow type annotations.

## Commands

```bash
npm start          # Dev server at https://localhost:3030 (self-signed cert)
npm run build      # Production build
npm test           # All tests (CI mode, jsdom, with coverage)
npm run lint src   # ESLint on src/ (uses react-app config)
npm run flow       # Flow type checking
```

There is no single-test runner configured. `react-scripts test` runs all matching tests; pass a filename pattern to narrow scope:
```bash
npx cross-env CI=true react-scripts test --env=jsdom Stat
```

## Architecture

### Data flow overview

```
Player data (API / C-3PO file / HotUtils)
  → IndexedDB (source of truth for large datasets)
    → Redux store (active view state only)
      → React components (containers connect to store, components are presentational)
        → Web Worker (runs the heavy optimization off the main thread)
```

### State management (Redux + thunks)

- **Store shape** defined in `src/state/storage.js` (`defaultState`). Top-level keys split into UI state (`section`, `modal`, `isBusy`, `progress`) and data state (`allyCode`, `profile`, `playerProfiles`, `gameSettings`).
- **Actions** are thunks organized by feature in `src/state/actions/` — `data.js` (fetch/import), `optimize.js` (kick off worker), `app.js` (UI), `storage.js` (DB load/save), `review.js`, `explore.js`, `characterEdit.js`.
- **Reducer** is a single function in `src/state/reducers/modsOptimizer.js`. State updates use `Object.assign({}, state, ...)` immutability pattern.
- **Persistence** is split: a whitelisted subset of state goes to `localStorage` (via `saveState` in the reducer); large data (profiles, game settings, last runs) lives in IndexedDB (`src/state/storage/Database.js`, db name: `ModsOptimizer`, version 2).

### Optimization engine

The core algorithm runs in a **web worker** at `public/workers/optimizer.js` to avoid blocking the UI.

- `src/state/actions/optimize.js` validates inputs and spawns the worker.
- The worker loads profile data from IndexedDB directly (can't import app modules), so it **duplicates some constants and helpers inline**.
- Progress is streamed back via `postMessage({type: 'Progress'})`, final results via `OptimizationSuccess`.
- Mod scores and upgraded-mod objects are aggressively cached within a run.

### Domain model (`src/domain/`)

All domain classes are **immutable** — mutations return new instances (e.g., `Character.withPlayerValues(...)`, `Mod.equip(characterID)`). Constructors call `Object.freeze(this)`.

Key classes:
- `Character` — owns `defaultSettings`, `gameSettings`, `playerValues`, `optimizerSettings`
- `Mod` — slot, set, primary/secondary stats, equipped character
- `ModSet` — 6-slot container, computes set bonuses + stat totals
- `OptimizationPlan` — stat weights (-100 to 100), primary restrictions, set restrictions, target stats
- `Stat` — handles flat/percent conversion, display, and scoring

### Bootstrap sequence

1. `src/index.js` creates Redux store with thunk middleware
2. Opens IndexedDB, dispatches `databaseReady()` on success
3. Renders `<Provider><App /></Provider>`
4. `App` constructor reads URL params (`allyCode`, `SessionID`, `NoPull`) and auto-fetches data, then strips the query string

## Key conventions

### Character targets (`src/constants/characterSettings.js`)

This is the most frequently edited file. It's a map keyed by character `baseID` where each entry is a `CharacterSettings` with an array of `OptimizationPlan` targets.

```js
'ADMIRALRADDUS': new CharacterSettings(
  [
    new OptimizationPlan('PvP', 10, 10, 100, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, true),
    new OptimizationPlan('Protection w/ Primaries', 10, 20, 100, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, true, {
      "triangle": "Protection %",
      "cross": "Protection %",
      "circle": "Protection %"
    }),
  ],
  [],              // aliases (searchable tags)
  DamageType.special  // optional damage type
),
```

`OptimizationPlan` positional args are: `name, health, protection, speed, critDmg, potency, tenacity, physDmg, specDmg, critChance, armor, resistance, accuracy, critAvoid, upgradeMods, primaryStatRestrictions, setRestrictions, targetStats, useOnlyFullSets`.

Reusable presets live in `src/constants/optimizationStrategy.js` (e.g., `optimizationStrategy.Speed`).

### Imports

Despite `jsconfig.json` setting `baseUrl: "src,src/components"`, the codebase uses **relative imports** everywhere. Follow the existing pattern.

### Flow annotations

Files begin with `// @flow`. The project uses Flow for type checking but coverage is partial. New files should include the annotation and match the style of neighboring files.

### Git workflow

**Do not commit or push code without explicit user approval.** Always ask for confirmation before performing any Git operations, including commits, pushes, pulls, merges, or branch deletions.

**All code changes must be made in a worktree** — never commit directly to the primary clone. The primary clone stays on `develop` and is used only for creating worktrees and pulling merged changes.

Create worktrees **adjacent to the primary clone** (sibling directory):
```bash
# With a work item ID
git worktree add C:\github-primary\NducTiOnomBi\mods-optimizer-12345 -b feature/description develop

# Without a work item
git worktree add C:\github-primary\NducTiOnomBi\mods-optimizer-short-desc -b feature/description develop
```

Create the worktree and switch into it **before** making any file edits.

### PR workflow

- PRs target the `develop` branch on the upstream repo.
- All code should pass `npm run lint src` and `npm test`.
- Commit messages: short summary (<50 chars), blank line, optional longer description.
