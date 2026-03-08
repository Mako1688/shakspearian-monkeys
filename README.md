# Shakespearian Monkeys

An idle game inspired by the **infinite monkey theorem** -- monkeys randomly hitting keys on typewriters, accidentally discovering real words, and earning bananas along the way.

> **Play the game:** [https://mako1688.github.io/shakspearian-monkeys/](https://mako1688.github.io/shakspearian-monkeys/)

> **Design principle:** there is no win condition or cap. Growth is infinite. Every upgrade, every accidental word discovered, every banana earned just makes the monkeys type faster on the way to forever.

---

## Table of Contents

1. [Game Concept](#game-concept)
2. [Progression and Banana Economy](#progression-and-banana-economy)
3. [Current Implementation](#current-implementation)
   - [File Structure](#file-structure)
   - [Game State](#game-state)
   - [Monkey System](#monkey-system)
   - [Upgrade System](#upgrade-system)
   - [Word Detection and Dictionary](#word-detection-and-dictionary)
   - [Combo System](#combo-system)
   - [BigInt Support](#bigint-support)
   - [Save / Load / Offline Progress](#save--load--offline-progress)
   - [Rendering Pipeline](#rendering-pipeline)
4. [How to Build and Run](#how-to-build-and-run)
5. [Open Questions and Next Steps](#open-questions-and-next-steps)

---

## Game Concept

You manage a troupe of monkeys with typewriters. Each monkey types **random characters** (a-z). Every character typed earns **1 banana**. When the random characters accidentally spell out a real English word, the monkey earns **bonus bananas** equal to the square of the word's length.

- **Manual play:** Click the typewriter button to generate random characters yourself.
- **Idle play:** Hired monkeys produce random characters passively every tick, even while the tab is in the background or closed.
- **Word discovery:** A built-in dictionary of ~10,000 common English words (3-10 letters) is checked in real time. Longer words are rarer and worth exponentially more bananas.
- **Per-monkey tracking:** Each hired monkey has its own name, character buffer, ticker output, and word discovery history.
- **Combo bonuses:** Finding multiple words in quick succession (within 3 seconds) builds a combo multiplier for extra bananas.

---

## Progression and Banana Economy

### Banana Earning

| Source | Bananas Earned |
|--------|---------------|
| Each character typed | +1 banana |
| 3-letter word found | +9 bananas (3 squared) |
| 4-letter word found | +16 bananas (4 squared) |
| 5-letter word found | +25 bananas (5 squared) |
| 6-letter word found | +36 bananas (6 squared) |
| 7-letter word found | +49 bananas (7 squared) |
| 8-letter word found | +64 bananas (8 squared) |
| 9-letter word found | +81 bananas (9 squared) |
| 10-letter word found | +100 bananas (10 squared) |

Word bonuses are further multiplied by per-monkey Word Mastery upgrades (1.5x per level) and combo multipliers.

### Upgrade Categories

Upgrades are organized into three tabs:

**All Monkeys (Global)**

| Upgrade | Base Cost | Cost Scaling | Effect |
|---------|-----------|-------------|--------|
| Hire Monkey | 10 bananas | x1.15 per purchase | Adds a new monkey typist |
| Better Typewriters | 100 bananas | x1.30 per purchase | +1 LPS per monkey |
| Monkey Training | 500 bananas | x1.50 per purchase | 2x LPS multiplier (all) |
| Golden Quill | 5,000 bananas | x1.75 per purchase | 10x LPS multiplier (all) |

**Click Powers**

| Upgrade | Base Cost | Cost Scaling | Effect |
|---------|-----------|-------------|--------|
| Quick Fingers | 25 bananas | x1.20 per purchase | +1 chars per click |
| Double Tap | 200 bananas | x1.50 per purchase | 2x click power |

**Individual Monkeys (Per-Monkey)**

| Upgrade | Base Cost | Cost Scaling | Effect |
|---------|-----------|-------------|--------|
| Speed Boost | 20 bananas | x1.15 per purchase | +1 LPS for this monkey only |
| Word Mastery | 100 bananas | x1.30 per purchase | 1.5x word bonus for this monkey |

Each monkey also has an editable name (defaulting to Shakespeare character names).

### LPS Calculation

Per-monkey LPS = (1 + global typewriter upgrades + monkey speed level) x (2 ^ training purchases) x (10 ^ quill purchases)

Total LPS = sum of all monkey LPS values

Click power = (1 + quick fingers level) x (2 ^ double tap level)

---

## Current Implementation

### File Structure

```
shakespearian-monkeys/
  index.html          -- Game UI, all DOM structure
  style.css           -- CSS variables, brown/gold theme, responsive styles
  scripts.ts          -- Game logic (state, tickers, upgrades, save/load)
  words.ts            -- Expanded dictionary (~10,000 words, 3-10 letters)
  dist/
    scripts.js        -- Compiled game logic
    words.js          -- Compiled dictionary module
  package.json        -- npm scripts: build (tsc), lint (tsc --noEmit)
  tsconfig.json       -- TypeScript compiler config
```

### Game State

The runtime state uses BigInt for banana and letter counts to maintain precision at very large numbers. Key state variables:

- `bananas: bigint` -- Spendable currency (BigInt for late-game precision)
- `totalLetters: bigint` -- All-time characters produced
- `globalUpgrades` -- Counts for each global upgrade purchased
- `clickUpgrades` -- Counts for click power upgrades
- `monkeys: MonkeyData[]` -- Array of individual monkey states
- `recentWords: string[]` -- Last 10 words discovered globally
- `wordCounts: Record<string, number>` -- Frequency of each word found
- `comboCount` -- Current word combo multiplier
- `lastSaveTime` -- Unix timestamp for offline progress calculation

State is serialized to JSON (BigInts stored as strings) and persisted to `localStorage`.

### Monkey System

Each hired monkey is an independent typing entity with:

- **Name:** Defaults to a Shakespeare character name (Hamlet, Othello, Macbeth, etc.), editable by the player
- **Buffer:** Rolling character buffer for word detection (up to 10 chars)
- **Display characters:** Recent character output shown in the monkey's ticker (up to 60 chars)
- **Ticker history:** List of recent word discoveries, capped at 12 entries
- **Words found counter:** Total words this monkey has discovered
- **Per-monkey upgrades:** Speed Boost (LPS) and Word Mastery (word bonus multiplier)

The player also has their own ticker for manual click output, separate from monkey tickers.

### Upgrade System

Upgrades use a tab-based UI with three categories:

1. **All Monkeys:** Global upgrades affecting all monkeys
2. **Click Powers:** Upgrades for manual clicking
3. **Individual Monkeys:** Per-monkey upgrades with name editing and stats

Cost scaling follows: `floor(baseCost x costMultiplier ^ level)`

### Word Detection and Dictionary

The dictionary (`words.ts`) contains ~10,000 unique English words:
- Length 3: ~667 words
- Length 4: ~2,446 words
- Length 5: ~3,500 words
- Length 6: ~1,800 words
- Length 7: ~1,000 words
- Length 8: ~500 words
- Length 9: ~250 words
- Length 10: ~100 words

Words are stored in a `Set` for O(1) lookup. After each character is generated, the buffer is checked from longest possible match (10) to shortest (3).

### Combo System

When words are found within 3 seconds of each other, a combo builds up:

- Combo 1: no bonus (first word)
- Combo 2: 1.1x bonus
- Combo 3: 1.2x bonus
- Combo N: (1 + (N-1) x 0.1)x bonus

The combo counter resets after 3 seconds with no word found. The current combo is displayed in the stats panel.

### BigInt Support

Bananas and total letters use JavaScript's native `BigInt` type for arbitrary precision arithmetic. This prevents precision loss that occurs with standard `number` beyond ~9 quadrillion.

- Runtime calculations use `bigint` directly
- JSON serialization converts to/from strings
- Display formatting handles BigInt via string-based SI suffix calculation (K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc)

### Save / Load / Offline Progress

- **Save:** State is serialized to JSON (BigInts as strings) and stored in `localStorage`
- **Load:** JSON is parsed and merged with defaults for forward compatibility
- **Auto-save:** Every 30 seconds, plus on page unload and tab hide
- **Offline progress:** On load, elapsed time since last save is used to:
  1. Award bananas for characters that would have been generated (LPS x elapsed time)
  2. Estimate words found offline (~1 per 5,000 chars heuristic)
  3. Display earnings in a welcome-back modal
- **Background tabs:** Uses the Page Visibility API to save on hide and calculate offline progress on show. Delta-time-based ticking handles browser throttling gracefully.

### Rendering Pipeline

```
renderAll()
  renderStats()           -- bananas, LPS, total letters, words found, combo
  renderPlayerTicker()    -- player character stream and word history
  renderMonkeyTickers()   -- per-monkey character streams and word histories
  renderUpgrades()        -- tab content (global, click, individual)
  renderWordDiscovery()   -- recent words, most common word, unique count
```

- `renderAll()` is called on: page init, manual click, upgrade purchase
- Stats, player ticker, and monkey tickers update every tick (100ms)
- Upgrades and word discovery update every 500ms for performance

---

## How to Build and Run

```bash
# Install dependencies
npm install

# Compile TypeScript to dist/
npm run build

# Type-check only (no output)
npm run lint

# Open in browser
open index.html
# or use a static server:
npx serve .
```

---

## Open Questions and Next Steps

- **Prestige / New Game+:** Could add prestige resets with permanent bonuses at high thresholds.
- **Word rarity tiers:** Rarer or longer words could give higher bonus multipliers beyond length squared.
- **Achievements:** Milestone rewards for discoveries, banana thresholds, and combo streaks.
- **SharedWorker:** A dedicated worker thread could keep the game ticking more reliably in background tabs.
- **State versioning:** As the save schema evolves, handle version migrations for backward compatibility.
