# Shakespearian Monkeys 🐒🎭

An idle game built on the **infinite monkey theorem** — the idea that a monkey randomly hitting keys on a typewriter for an infinite amount of time will eventually type the complete works of Shakespeare.

> **Design principle:** there is no win condition or cap. Growth is infinite. Every upgrade, every cycle through the quote pool, every banana earned just makes the monkeys type faster on the way to forever.

---

## Table of Contents

1. [Game Concept](#game-concept)
2. [Progression & Ticker](#progression--ticker)
3. [Current Implementation](#current-implementation)
   - [File Structure](#file-structure)
   - [Game State](#game-state)
   - [Game Loop / Ticker](#game-loop--ticker)
   - [Letters, Bananas & Quotes](#letters-bananas--quotes)
   - [Upgrades](#upgrades)
   - [Number Formatting](#number-formatting)
   - [Save / Load / Offline Progress](#save--load--offline-progress)
   - [Rendering Pipeline](#rendering-pipeline)
4. [How to Build & Run](#how-to-build--run)
5. [Open Questions & Future Ideas](#open-questions--future-ideas)

---

## Game Concept

You manage a troupe of monkeys with typewriters. As they type random characters they occasionally form real words, phrases, and — with enough monkeys and upgrades — complete passages from Shakespeare's works.

- **Manual play:** Click the typewriter button (+1 letter per click).
- **Idle play:** Monkeys produce letters passively every tick, even while the tab is closed.
- **Progression:** As letters accumulate the game advances through a pool of 15 Shakespeare quotes, then cycles back to the beginning — *infinitely*. Each full cycle is tracked and displayed in the UI.

---

## Progression & Ticker

### Ticker

The game runs a **tick every 100 ms** (10 ticks per second), controlled by `setInterval(gameTick, TICK_INTERVAL_MS)` in `init()`.

Each tick:
1. Calculates `lps / 10` (letters this tick).
2. Calls `addLetters(lettersThisTick)` to credit bananas, advance total letters, and advance through the quote.
3. Calls `renderStats()`, `renderUpgrades()`, and `renderTypewriter()` to refresh the UI.

`renderAchievements()` is called only on `renderAll()` (page load, click, purchase) to avoid rebuilding the DOM 10 times per second.

### Progression Display

| UI Stat | Meaning |
|---------|---------|
| 🍌 **Bananas** | Spendable currency (earned = total letters produced, spent on upgrades) |
| ⌨️ **Letters/sec** | Current LPS — the core production rate |
| 📝 **Total Letters** | All letters ever produced (never resets) |
| 📖 **Quotes Done** | Total individual Shakespeare quotes completed all-time (`state.quoteIndex`) |
| 🔄 **Cycle** | How many times the full 15-quote pool has been completed + 1 |

The **progress bar** under the typewriter output shows how far along the current quote you are (0 → 100 %).

The **Shakespeare Progress** section lists all 15 quotes in the current cycle with status: ✅ Complete / 📝 In progress / 🔒 Locked. A cycle header shows the current cycle number and the all-time quote completion count.

---

## Current Implementation

### File Structure

```
shakespearian-monkeys/
├── index.html          # Game UI — all DOM structure
├── style.css           # CSS variables, layout, responsive styles
├── scripts.ts          # All TypeScript game logic (single file)
├── dist/
│   └── scripts.js      # Compiled output (do not edit directly)
├── package.json        # npm scripts: build (tsc), lint (tsc --noEmit)
└── tsconfig.json       # TypeScript compiler config
```

### Game State

Everything is stored in one `GameState` object:

```typescript
interface GameState {
  bananas: number;          // Spendable currency
  totalLetters: number;     // All-time letters produced
  clickPower: number;       // Letters per manual click (currently always 1)
  upgrades: Record<UpgradeId, number>; // Count of each upgrade purchased
  quoteIndex: number;       // Total quotes completed all-time (unbounded — never mod-wrapped in state)
  quoteCharIndex: number;   // Characters typed in the current quote
  lastSaveTime: number;     // Unix timestamp (ms) used for offline progress
}
```

`quoteIndex` is intentionally **unbounded** — it keeps incrementing forever. To find which quote is currently active use `quoteIndex % SHAKESPEARE_QUOTES.length`. To find the current cycle use `Math.floor(quoteIndex / SHAKESPEARE_QUOTES.length) + 1`.

State is persisted to `localStorage` under the key `"shakespearian-monkeys-save"` and rehydrated on load with `defaultState()` merged over the parsed JSON so missing fields from old saves get safe defaults.

### Game Loop / Ticker

```typescript
const TICK_INTERVAL_MS = 100; // 10 ticks per second
setInterval(gameTick, TICK_INTERVAL_MS);
```

`gameTick()`:
```typescript
function gameTick(): void {
  const lps = getLettersPerSecond();
  const lettersThisTick = lps / (1000 / TICK_INTERVAL_MS); // lps / 10
  if (lettersThisTick > 0) addLetters(lettersThisTick);
  renderStats();
  renderUpgrades();
  renderTypewriter();
}
```

A separate `setInterval(saveGame, AUTO_SAVE_INTERVAL_MS)` auto-saves every **30 seconds**. A `beforeunload` listener also saves on tab close.

### Letters, Bananas & Quotes

`addLetters(amount)` is the central mutator:

1. Credits `state.bananas` and `state.totalLetters` by `amount`.
2. Loops, consuming `amount` character by character against the current quote until `amount` is exhausted or a quote completes.
3. When a quote completes: `quoteCharIndex` resets to 0 and `quoteIndex++` (no modulo, so it grows forever).
4. Partial progress is stored in `quoteCharIndex`.

Because `amount` is fractional during idle ticks (e.g. 0.5 letters/tick at 5 LPS), `Math.floor(remaining)` is used when storing `quoteCharIndex` to avoid sub-character rendering.

### Upgrades

Four upgrades, each stackable without limit:

| ID | Name | Base Cost | Cost Scaling | Effect |
|----|------|-----------|-------------|--------|
| `monkey` | 🐵 Hire Monkey | 10 🍌 | ×1.15 per purchase | +1 flat LPS |
| `typewriter` | ⌨️ Better Typewriter | 50 🍌 | ×1.25 per purchase | +5 flat LPS |
| `training` | 📚 Monkey Training | 500 🍌 | ×1.50 per purchase | 2× LPS multiplier |
| `quill` | 🪶 Shakespeare's Quill | 5 000 🍌 | ×1.75 per purchase | 10× LPS multiplier |

`getLettersPerSecond()` computes:
```
LPS = (sum of lpsAdd × owned) × (product of lpsMultiplier ^ owned for each multiplier upgrade)
```

Example: 10 monkeys + 1 training = (10 × 1) × (2^1) = 20 LPS.

Cost of the nth unit: `Math.floor(baseCost × costMultiplier^n)`.

### Number Formatting

`formatNumber(n)` renders large numbers with SI-style suffixes for infinite-scale readability:

| Threshold | Suffix |
|-----------|--------|
| < 1 000 | raw integer |
| ≥ 1 000 | K |
| ≥ 1 000 000 | M |
| ≥ 1 000 000 000 | B |
| ≥ 1e12 | T |
| ≥ 1e15 | Qa (quadrillion) |
| ≥ 1e18 | Qi (quintillion) |
| ≥ 1e21 | Sx (sextillion) |
| ≥ 1e24 | Sp (septillion) |
| ≥ 1e27 | Oc (octillion) |
| ≥ 1e30 | No (nonillion) |
| ≥ 1e33 | Dc (decillion) |

JavaScript `number` is a 64-bit float, so precision degrades above ~2^53 ≈ 9×10^15. If the game ever needs accurate integers above that range, `BigInt` would be required (see Open Questions).

### Save / Load / Offline Progress

- **Save:** `JSON.stringify(state)` → `localStorage`.
- **Load:** `JSON.parse` → merged with `defaultState()` so new fields always have safe values.
- **Offline progress:** On load, the elapsed seconds since `lastSaveTime` are multiplied by the current LPS. **There is no cap** — the full offline duration is credited. The result is shown in a welcome-back modal.

### Rendering Pipeline

```
renderAll()
  ├── renderStats()          — bananas, LPS, total letters, quotes done, cycle
  ├── renderUpgrades()       — costs, owned counts, button disabled state
  ├── renderTypewriter()     — quote text, progress bar %
  └── renderAchievements()   — cycle header + per-quote status list
```

`renderAll()` is called on: page init, manual click, upgrade purchase.  
`renderStats() + renderUpgrades() + renderTypewriter()` are called every tick (100 ms).

---

## How to Build & Run

```bash
# Install dependencies
npm install

# Compile TypeScript → dist/scripts.js
npm run build

# Type-check only (no output)
npm run lint

# Open in browser
open index.html
# or use a static server:
npx serve .
```

---

## Open Questions & Future Ideas

These are unresolved design questions worth discussing in a future session:

### Progression
1. **Prestige / New Game+** — Should completing N full cycles unlock a "prestige" reset that multiplies a permanent bonus? What is the right cycle threshold?
2. **More quotes** — The current pool has 15 quotes. Should the pool expand (more Shakespeare, other authors, random generation)? How do we avoid the cycle feeling repetitive?
3. **Milestones** — Should there be milestone rewards at certain `quoteIndex` values (e.g. every 100 quotes completed) instead of per-cycle unlocks?

### Economy & Balance
4. **More upgrade tiers** — What should the next tier of upgrades look like? More flat LPS options, or more aggressive multipliers? Should there be synergy bonuses (e.g. "each quill multiplies monkey output by 1.5× instead of a flat 10×")?
5. **Banana spending vs. LPS investment** — Is the current 4-upgrade curve well-balanced? When does a player first feel the multipliers matter vs. spamming monkeys?
6. **Click power scaling** — `clickPower` is wired into the state but always 1. Should there be a "better clicking" upgrade or prestige bonus that scales it?

### Technical
7. **BigInt for large numbers** — JS `number` loses integer precision above ~9 quadrillion. Should `bananas` / `totalLetters` switch to `BigInt` or a custom big-number library at some threshold?
8. **Worker / background ticker** — A `SharedWorker` or `Service Worker` could keep the game ticking even when the tab is hidden (browsers throttle `setInterval` in background tabs). Is this worth the complexity?
9. **State versioning** — As the save schema evolves, how should version migrations be handled? (Current approach: merge with `defaultState()` on load — works for additive changes but not renames or removals.)
10. **Multiple saves / slots** — Should players be able to have more than one save file?

### UX
11. **Visual feedback for quote completion** — Should there be an animation or sound when a quote finishes?
12. **Ticker speed display** — Should the raw tick rate (100 ms) or a "letters this tick" counter be surfaced in the UI for transparency?
13. **Achievements separate from Shakespeare Progress** — The current "achievements" panel is really just a quote tracker. Should there be a separate achievements system (e.g. "Type 1 million letters", "Own 100 monkeys")?

