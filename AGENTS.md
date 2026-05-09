# AGENTS.md — mods-optimizer

Fork of [grandivory/mods-optimizer](https://github.com/grandivory/mods-optimizer). A single-page React application that optimizes mod assignments in Star Wars: Galaxy of Heroes by applying stat weights to every potential mod, scoring full sets, and finding the highest-value assignment per character.

**Stack:** React 16, Redux 4, redux-thunk, Flow type annotations, IndexedDB + localStorage persistence, Web Worker for optimization.

---

## Commands

```bash
npm start                # Dev server at https://localhost:3030 (self-signed cert, HTTPS=true)
npm run build            # Production build
npm test                 # All tests (CI=true, jsdom, with coverage)
npm run lint src         # ESLint on src/ (react-app config)
npm run flow             # Flow type checking
```

### Running a single test

There is no dedicated single-test script. Narrow scope by passing a filename pattern:

```bash
npx cross-env CI=true react-scripts test --env=jsdom Stat
npx cross-env CI=true react-scripts test --env=jsdom OptimizationPlan
```

Use this for the tight RED-GREEN feedback loop during TDD (see below).

---

## Architecture

### Data flow

```
Player data (swgoh.gg API / C-3PO inventory file / HotUtils)
  → IndexedDB (source of truth for large datasets: profiles, game settings, last runs)
    → Redux store (active view state only — lightweight subset)
      → React components (containers connect to store; components are presentational)
        → Web Worker (runs the heavy combinatorial optimization off the UI thread)
```

### State management (Redux + thunks)

- **Default state** defined in `src/state/storage.js`. Top-level keys split into:
  - UI state: `section`, `modal`, `isBusy`, `progress`, `showSidebar`, `flashMessage`, `error`
  - Data state: `allyCode`, `profile`, `playerProfiles`, `gameSettings`, `characterTemplates`
- **Actions** are thunks organized by feature in `src/state/actions/`:
  - `data.js` — fetch/import player data, populate IndexedDB
  - `optimize.js` — validate inputs, spawn the optimization web worker
  - `app.js` — UI state (modals, flash messages, busy indicator)
  - `storage.js` — IndexedDB load/save operations
  - `characterEdit.js`, `review.js`, `explore.js` — feature-specific actions
- **Reducer** is a single function in `src/state/reducers/modsOptimizer.js`. State updates use `Object.assign({}, state, ...)` — never mutate state directly.
- **Persistence** is split across two stores:
  - **localStorage** — a whitelisted subset of UI preferences only (via `saveState` in the reducer). Keys: `allyCode`, `characterFilter`, `characterEditMode`, `characterEditSortView`, `hideSelectedCharacters`, `keepOldMods`, `modsFilter`, `modSetsFilter`, `modListFilter`, `optimizerView`, `section`, `showSidebar`, `version`.
  - **IndexedDB** — large data (profiles, game settings, last optimization runs, character templates). Managed by `src/state/storage/Database.js`, db name `ModsOptimizer`, version 2.

### Optimization engine

The core mod-scoring and assignment algorithm runs in a **web worker** at `public/workers/optimizer.js` to avoid blocking the UI.

- `src/state/actions/optimize.js` validates inputs and spawns the worker.
- The worker loads profile data directly from IndexedDB — it **cannot import modules from `src/`**.
- Because of this isolation, the worker **duplicates constants and helper code inline**. This is the single most important architectural constraint in the codebase.
- Communication protocol:
  - Worker → main: `postMessage({type: 'Progress', ...})` for progress updates
  - Worker → main: `postMessage({type: 'OptimizationSuccess', ...})` for final results
- The worker aggressively caches mod scores, upgraded-mod objects, and flattened stat values within a run.

### Domain model (`src/domain/`)

All domain classes are **immutable**. Constructors call `Object.freeze(this)`. Mutations always return new instances.

| Class | Purpose | Key mutations |
|-------|---------|---------------|
| `Character` | Player character with settings, game data, optimizer config | `withPlayerValues(...)`, `withOptimizerSettings(...)` |
| `Mod` | A single mod with slot, set, primary/secondary stats | `equip(characterID)`, `unequip()`, `levelUp()`, `slice()` |
| `ModSet` | 6-slot container of Mods, computes set bonuses + stat totals | Constructed from Mod array |
| `OptimizationPlan` | Stat weights (-100 to 100), restrictions, target stats | `rename(...)`, `withUpgradeMods(...)` |
| `Stat` | Stat value with flat/percent handling, display, scoring | Immutable — no mutations |
| `TargetStat` | A specific stat threshold to meet during optimization | Immutable |
| `SetBonus` | Mod set bonus definition | Immutable |
| `PlayerProfile` | Full player profile with mods and character data | Serialization/deserialization |

### Bootstrap sequence

1. `src/index.js` creates the Redux store with thunk middleware.
2. Opens IndexedDB via `getDatabase()`. On success, dispatches `databaseReady(store.getState())`.
3. Renders `<Provider store={store}><App /></Provider>` into `#root`.
4. `App` constructor reads URL params (`allyCode`, `SessionID`, `NoPull`), auto-fetches data, then strips the query string.

---

## TDD: Red-Green-Refactor (Mandatory)

**All new code and modifications to existing code MUST follow the Red-Green-Refactor cycle.** This is not optional — it applies to every change regardless of size.

### The cycle

1. **RED — Write a failing test first.** Before writing any production code, create a test that defines the expected behavior. Run it and verify it fails. This proves the test is actually testing something and that the behavior does not already exist.

2. **GREEN — Write the minimum code to pass.** Write only enough production code to make the failing test pass. Do not add extra logic, optimizations, or "while I'm here" improvements. The goal is the shortest path from red to green.

3. **REFACTOR — Clean up with confidence.** With a passing test as your safety net, refactor the code for clarity, performance, or reduced duplication. Run the full test suite after refactoring to confirm nothing broke. If a test goes red, fix the code (not the test) unless the test itself was wrong.

### Applying TDD in this codebase

- **Test location:** Place tests adjacent to the code they test, following the `react-scripts` convention (e.g., `Stat.test.js` next to `Stat.js`, or in a `__tests__/` subdirectory).
- **Tight feedback loop:** Use the single-test runner during RED and GREEN phases:
  ```bash
  npx cross-env CI=true react-scripts test --env=jsdom Stat
  ```
- **What to test:** Domain logic (`src/domain/`), utility functions (`src/utils/`), reducer logic (`src/state/reducers/`), and action thunks (`src/state/actions/`). Presentational components are lower priority.
- **Current test debt:** The existing test suite contains only one smoke test (`App.test.js` — "renders without crashing"). This is acknowledged technical debt, not a license to skip TDD. Every new change adds to the suite.
- **Worker testing:** The web worker (`public/workers/optimizer.js`) is difficult to unit test directly due to its isolation. When modifying worker logic, extract testable pure functions and test those. Integration-test the worker via the optimization action thunks.

### Example cycle

```
# 1. RED — write a failing test for Stat.hasPercentValue()
#    Run: npx cross-env CI=true react-scripts test --env=jsdom Stat
#    Result: FAIL ✗

# 2. GREEN — implement hasPercentValue() on the Stat class
#    Run: same command
#    Result: PASS ✓

# 3. REFACTOR — extract shared logic, rename for clarity
#    Run: npm test (full suite to catch regressions)
#    Result: PASS ✓ — commit
```

---

## Coding Guidelines

### Immutability

- Domain objects (`src/domain/`) call `Object.freeze(this)` in their constructors. NEVER attempt to assign properties on a domain object after construction.
- All mutations return **new instances**:
  ```js
  // ✅ Correct — returns a new Character
  const updated = character.withPlayerValues(newValues);

  // ❌ Wrong — throws in strict mode, silently fails otherwise
  character.playerValues = newValues;
  ```
- Redux state follows the same pattern: `Object.assign({}, state, { key: newValue })`. NEVER mutate state in the reducer.

### Imports

The codebase uses **relative imports exclusively**, even though `jsconfig.json` sets `baseUrl: "src,src/components"`. ALWAYS use relative paths:

```js
// ✅ Correct
import OptimizationPlan from "../domain/OptimizationPlan";
import { CharacterSettings } from "../domain/CharacterDataClasses";

// ❌ Wrong — do not use absolute/aliased imports
import OptimizationPlan from "domain/OptimizationPlan";
```

### Flow type annotations

- Files begin with `// @flow`. Coverage is partial but new files MUST include the annotation.
- Match the style of neighboring files. Flow is at version 0.80 — do not use syntax from newer versions.

### Component architecture

- **Containers** (`src/containers/`) connect to the Redux store via `react-redux`. They handle data fetching, state mapping, and dispatch.
- **Components** (`src/components/`) are presentational. They receive data via props and have no Redux dependency.
- When adding UI, determine whether it needs store access (container) or just renders data (component).

### Character targets (`src/constants/characterSettings.js`)

This is the **most frequently edited file** in the codebase. Each entry maps a character `baseID` to a `CharacterSettings` with an array of `OptimizationPlan` targets.

The `OptimizationPlan` constructor takes **18 positional arguments** with no named parameters:

```
OptimizationPlan(
  name,                    // string — target name (e.g., "PvP", "hSTR P1")
  health,                  // number — weight (-100 to 100)
  protection,              // number
  speed,                   // number
  critDmg,                 // number
  potency,                 // number
  tenacity,                // number
  physDmg,                 // number
  specDmg,                 // number
  critChance,              // number
  armor,                   // number
  resistance,              // number
  accuracy,                // number
  critAvoid,               // number
  upgradeMods = true,      // boolean
  primaryStatRestrictions = {},  // object — e.g., { triangle: "Protection %" }
  setRestrictions = {},    // object
  targetStats = [],        // TargetStat[]
  useOnlyFullSets = false  // boolean
)
```

**Misplacing a single value silently produces wrong optimization results with no error.** Always use the inline comment pattern from `optimizationStrategy.js` when the meaning of a value is not obvious from context:

```js
new OptimizationPlan('PvP',
  0,   // health
  0,   // protection
  100, // speed
  0,   // crit damage
  25,  // potency
  0,   // tenacity
  0,   // physical damage
  50,  // special damage
  50,  // crit chance
  0,   // armor
  0,   // resistance
  0,   // accuracy
  0    // crit avoidance
)
```

### Reusable optimization strategies

Common target patterns are defined in `src/constants/optimizationStrategy.js` (e.g., `optimizationStrategy.Speed`, `optimizationStrategy["Speedy debuffer"]`). Reference these instead of duplicating weights:

```js
'ADMIRALACKBAR': new CharacterSettings(
  [
    new OptimizationPlan('Survivability', 20, 20, 100, 0, 0, 25, 0, 0, 0, 0, 0, 0, 0, true),
    optimizationStrategy.Speed  // ← reuse preset
  ],
  ['AA', 'Snackbar', 'ABC']    // ← aliases for search
),
```

---

## Critical Constraints

### 1. Web worker duplication (CRITICAL)

`public/workers/optimizer.js` **cannot import from `src/`**. It duplicates key constants, stat calculations, and domain logic inline.

**If you change any of the following in `src/`, you MUST manually update the corresponding code in the worker:**
- `src/domain/Stat.js` — stat calculation, flat/percent conversion
- `src/domain/Mod.js` — mod scoring logic
- `src/domain/ModSet.js` — set bonus calculations
- `src/domain/OptimizationPlan.js` — weight application
- `src/constants/setbonuses.js` — set bonus definitions
- `src/constants/statTypeMap.js` — stat type mappings
- `src/utils/subjectiveScoring.js` — scoring algorithm

Failure to sync changes will cause the optimizer to produce silently incorrect results.

### 2. localStorage size boundary

The `saveState` function in the reducer persists only a **whitelisted subset** to localStorage. Large data (profiles, mods, game settings) goes to IndexedDB via `Database.js`.

- NEVER add a key holding large data to the localStorage whitelist — this will exceed browser storage limits and cause silent data loss.
- If adding a new state key that holds player data or mod data, persist it via `Database.js` using the existing IndexedDB patterns.

### 3. `RESET_STATE` triggers a full reload

The `RESET_STATE` action calls `window.location.reload()` after saving. This is intentional — do not try to handle state reset through Redux alone.

---

## Prohibitions

- **NEVER** use absolute or aliased imports — always use relative paths
- **NEVER** mutate frozen domain objects — always return new instances
- **NEVER** mutate Redux state directly — always use `Object.assign({}, state, ...)`
- **NEVER** add large data keys to `saveState`'s localStorage whitelist
- **NEVER** modify `src/domain/` or `src/constants/` without checking if `public/workers/optimizer.js` needs a corresponding update
- **NEVER** skip the TDD Red-Green-Refactor cycle for new or modified code
- **NEVER** delete or weaken existing tests to make new code pass — fix the code instead
- **NEVER** commit code that fails `npm run lint src` or `npm test`

---

## Verification Checklist

Before declaring any change complete, verify all of the following:

- [ ] New/changed behavior has tests written RED-first (TDD cycle followed)
- [ ] `npm run lint src` passes with no errors
- [ ] `npm test` passes (all existing + new tests green)
- [ ] `npm run flow` shows no new errors
- [ ] New files include `// @flow` header
- [ ] If `src/domain/` or `src/constants/` changed → `public/workers/optimizer.js` reviewed and updated
- [ ] If new Redux state key added → persistence target chosen (localStorage whitelist vs IndexedDB)
- [ ] Relative imports used (no absolute/aliased imports)
- [ ] Domain mutations return new instances (no property assignment on frozen objects)

---

## PR & Commit Conventions

- **PRs target** the `develop` branch on the upstream repo ([grandivory/mods-optimizer](https://github.com/grandivory/mods-optimizer)).
- **Commit message format:**
  ```
  Short summary of change (<50 characters)

  Longer description (if necessary) of what changed, and why.
  Include caveats for the new code or known issues.
  ```
- All code must pass `npm run lint src` and `npm test` before submission.
- No change is too small to contribute.
