# Shakespearian Monkeys 🐒🍌

An idle game inspired by the **infinite monkey theorem** — monkeys randomly hitting keys on typewriters, accidentally discovering real words, and earning bananas along the way.

> **Play the game:** [https://mako1688.github.io/shakspearian-monkeys/](https://mako1688.github.io/shakspearian-monkeys/)

> **Design principle:** there is no win condition or cap. Growth is infinite. Every upgrade, every accidental word discovered, every banana earned just makes the monkeys type faster on the way to forever.

---

## Table of Contents

1. [Game Concept](#game-concept)
2. [Progression & Banana Economy](#progression--banana-economy)
3. [Current Implementation](#current-implementation)
   - [File Structure](#file-structure)
   - [Game State](#game-state)
   - [Game Loop / Ticker](#game-loop--ticker)
   - [Character Generation & Word Detection](#character-generation--word-detection)
   - [Upgrades](#upgrades)
   - [Number Formatting](#number-formatting)
   - [Save / Load / Offline Progress](#save--load--offline-progress)
   - [Rendering Pipeline](#rendering-pipeline)
4. [How to Build & Run](#how-to-build--run)
5. [Open Questions & Next Steps](#open-questions--next-steps)

---

## Game Concept

You manage a troupe of monkeys with typewriters. Each monkey types **random characters** (a–z). Every character typed earns **1 banana**. When the random characters accidentally spell out a real English word, the monkey earns **bonus bananas** equal to the square of the word's length.

- **Manual play:** Click the typewriter button (+1 random character per click).
- **Idle play:** Monkeys produce random characters passively every tick, even while the tab is closed.
- **Word discovery:** A built-in dictionary of ~2,900 common English words (3–8 letters) is checked in real time. Longer words are rarer and worth exponentially more bananas.

---

## Progression & Banana Economy

### Banana Earning

| Source | Bananas Earned |
|--------|---------------|
| Each character typed | +1 🍌 |
| 3-letter word found | +9 🍌 (3²) |
| 4-letter word found | +16 🍌 (4²) |
| 5-letter word found | +25 🍌 (5²) |
| 6-letter word found | +36 🍌 (6²) |
| 7-letter word found | +49 🍌 (7²) |
| 8-letter word found | +64 🍌 (8²) |

### Word Detection

Each monkey types random lowercase characters (a–z). A rolling buffer tracks the last few characters. After every new character, the game checks if the buffer ends with any word in the dictionary (longest match first). When a word is found:

1. Bonus bananas are awarded (word length²).
2. The word is recorded in the recent words list (last 10).
3. The word frequency counter is updated.
4. The buffer is cleared to start fresh.

### UI Stats

| UI Stat | Meaning |
|---------|---------|
| 🍌 **Bananas** | Spendable currency |
| ⌨️ **Letters/sec** | Current characters per second (LPS) |
| 📝 **Total Letters** | All characters ever typed |
| 📖 **Words Found** | Total words accidentally discovered |

The **Word Discoveries** panel shows:
- **Unique words** discovered
- **Most common word** found (with count)
- **Recent words** (last 10 discoveries with bonus shown)

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
  bananas: number;                       // Spendable currency
  totalLetters: number;                  // All-time characters produced
  clickPower: number;                    // Characters per manual click
  upgrades: Record<UpgradeId, number>;   // Count of each upgrade purchased
  wordBuffer: string;                    // Rolling buffer for word detection
  recentWords: string[];                 // Last 10 words discovered
  wordCounts: Record<string, number>;    // Frequency of each word found
  totalWordsFound: number;               // All-time word count
  lastSaveTime: number;                  // Unix timestamp (ms) for offline progress
}
```

State is persisted to `localStorage` under the key `"shakespearian-monkeys-save"` and rehydrated on load with `defaultState()` merged over the parsed JSON so missing fields from old saves get safe defaults.

### Game Loop / Ticker

```typescript
const TICK_INTERVAL_MS = 100; // 10 ticks per second
setInterval(gameTick, TICK_INTERVAL_MS);
```

Each tick:
1. Calculates `lps / 10` (characters this tick).
2. Calls `generateCharacters(charsThisTick)` to generate random chars, award bananas, and check for words.
3. Calls `renderStats()`, `renderUpgrades()`, and `renderTypewriter()` to refresh the UI.

A separate `setInterval(saveGame, AUTO_SAVE_INTERVAL_MS)` auto-saves every **30 seconds**. A `beforeunload` listener also saves on tab close.

### Character Generation & Word Detection

`generateCharacters(amount)` is the central mutator:

1. Awards 1 banana per character (floor of amount).
2. For each character: generates a random letter (a–z), appends to `wordBuffer` and `displayBuffer`.
3. After each character, calls `checkForWord()` which checks suffixes from longest (8) to shortest (3) against the word dictionary.
4. If a word is found: awards bonus bananas, records the word, clears the buffer.
5. If no word is found: trims the buffer to the last 8 characters.

The dictionary (`WORD_SET`) contains ~2,900 unique English words filtered to lowercase a–z only, lengths 3–8.

### Upgrades

Four upgrades, each stackable without limit:

| ID | Name | Base Cost | Cost Scaling | Effect |
|----|------|-----------|-------------|--------|
| `monkey` | 🐵 Hire Monkey | 10 🍌 | ×1.15 per purchase | +1 flat LPS |
| `typewriter` | ⌨️ Better Typewriter | 50 🍌 | ×1.25 per purchase | +5 flat LPS |
| `training` | 📚 Monkey Training | 500 🍌 | ×1.50 per purchase | 2× LPS multiplier |
| `quill` | 🪶 Golden Quill | 5 000 🍌 | ×1.75 per purchase | 10× LPS multiplier |

`getLettersPerSecond()` computes:
```
LPS = (sum of lpsAdd × owned) × (product of lpsMultiplier ^ owned for each multiplier upgrade)
```

Example: 10 monkeys + 1 training = (10 × 1) × (2¹) = 20 LPS.

Cost of the nth unit: `Math.floor(baseCost × costMultiplier^n)`.

### Number Formatting

`formatNumber(n)` renders large numbers with SI-style suffixes (K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc) for infinite-scale readability.

### Save / Load / Offline Progress

- **Save:** `JSON.stringify(state)` → `localStorage`.
- **Load:** `JSON.parse` → merged with `defaultState()` so new fields always have safe values.
- **Offline progress:** On load, elapsed seconds since `lastSaveTime` are multiplied by current LPS. Bananas are credited directly (no word detection for offline). The result is shown in a welcome-back modal.

### Rendering Pipeline

```
renderAll()
  ├── renderStats()          — bananas, LPS, total letters, words found
  ├── renderUpgrades()       — costs, owned counts, button disabled state
  ├── renderTypewriter()     — random character stream, current buffer
  └── renderWordDiscovery()  — recent words, most common word, unique count
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

## Open Questions & Next Steps

These are potential next steps and open design questions:

### Gameplay
1. **Per-monkey tracking** — Give each hired monkey an individual character buffer and track which monkey found which word. Show the most recent word per monkey.
2. **Prestige / New Game+** — Should reaching a certain word count or banana threshold unlock a prestige reset with permanent bonuses?
3. **Word rarity tiers** — Should rarer words (longer or less common) give even higher bonus multipliers beyond length²?
4. **Achievements** — Milestone rewards (e.g. "Discover 100 unique words", "Find a 7-letter word", "Earn 1 million bananas").

### Economy & Balance
5. **More upgrade tiers** — New upgrades that boost word discovery rate or increase word bonus multipliers.
6. **Click power scaling** — `clickPower` is wired into the state but always 1. Should there be a "better clicking" upgrade?
7. **Word combo bonuses** — Bonus for finding multiple words in quick succession.

### Technical
8. **Expanded dictionary** — The current ~2,900 word dictionary covers common words. Could expand to 10,000+ for more variety.
9. **BigInt for large numbers** — JS `number` loses precision above ~9 quadrillion. Consider `BigInt` for late-game.
10. **Worker / background ticker** — A `SharedWorker` could keep the game ticking when the tab is hidden (browsers throttle `setInterval` in background tabs).
11. **State versioning** — As the save schema evolves, handle version migrations beyond the current merge-with-defaults approach.

