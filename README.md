# Shakespearian Monkeys

An idle game inspired by the **infinite monkey theorem** — a troop of monkeys type random characters on typewriters, accidentally discovering real English words and earning bananas along the way.

> **Play the game:** [https://mako1688.github.io/shakspearian-monkeys/](https://mako1688.github.io/shakspearian-monkeys/)

> **Design principle:** no win condition, no cap. Growth is infinite. Every upgrade, every accidental word, every banana just makes the monkeys type faster on the way to forever.

---

## How It Works

You start with one monkey. Monkeys type random lowercase letters at a steady pace. Every letter earns **1 banana**. When the letters accidentally spell a real English word, the monkey earns **bonus bananas** equal to the square of the word's length.

Spend bananas on upgrades to hire more monkeys, make them type faster, and multiply their output. There is no manual clicking — everything is driven entirely by monkey generation.

---

## Visual Design

Each hired monkey is displayed as a narrow column that looks like a continuously printing receipt. New characters appear at the top and flow downward. When a word is discovered, it **floats upward** from the monkey's name as an animated label, then fades out.

Monkeys are arranged in a responsive grid so more monkeys fill the screen as you hire them.

---

## Banana Economy

| Source | Bananas |
|--------|---------|
| Each character typed | +1 |
| 3-letter word found | +9 (3²) |
| 4-letter word found | +16 (4²) |
| 5-letter word found | +25 (5²) |
| ... up to 10-letter word | +100 (10²) |

Word bonuses are further multiplied by per-monkey Word Mastery upgrades (×1.5 per level) and combo multipliers (finding multiple words within 3 seconds).

---

## Upgrades

### All Monkeys (Global)

| Upgrade | Base Cost | Cost Scaling | Effect |
|---------|-----------|-------------|--------|
| Hire Monkey | 15 bananas | ×1.50 | +1 new monkey |
| Better Typewriters | 250 bananas | ×1.65 | +1 LPS per monkey |
| Monkey Training | 2,000 bananas | ×2.20 | ×1.5 LPS multiplier (all) |
| Golden Quill | 40,000 bananas | ×3.50 | ×3 LPS multiplier (all) |

### Individual Monkeys (Per-Monkey)

| Upgrade | Base Cost | Cost Scaling | Effect |
|---------|-----------|-------------|--------|
| Speed Boost | 40 bananas | ×1.45 | +1 LPS for this monkey |
| Word Mastery | 200 bananas | ×1.65 | ×1.5 word bonus for this monkey |

Each monkey also has an editable name (defaults to a Shakespeare character name).

### LPS Calculation

```
Per-monkey LPS = min(
  (1 + typewriter_upgrades + monkey_speed_level)
    × (1.5 ^ training_level)
    × (3 ^ quill_level),
  200
)
```

The hard cap of 200 LPS per monkey prevents runaway scaling from freezing the browser.

---

## Word Detection

The dictionary (`words.ts`) contains ~10,000 common English words (3–10 letters). After every character is generated, the rolling buffer is checked from the longest possible match (10 chars) down to the shortest (3 chars).

Non-real words that appear in the system dictionary are filtered via a banned-words list. This includes Roman numerals (iii, viii, xiv, etc.) and repeated letter strings that are not genuine vocabulary.

---

## Combo System

Words found within 3 seconds of each other build a combo:

- Combo 1: no bonus
- Combo 2: ×1.1
- Combo N: ×(1 + (N−1) × 0.1)

The combo counter resets after 3 seconds with no word found.

---

## Save / Load / Offline Progress

- **Save:** State serialized to JSON (`localStorage`), BigInts stored as strings
- **Auto-save:** Every 30 seconds, plus on tab hide and page unload
- **Offline progress:** On return, elapsed time × LPS awards bananas and estimates words found (~1 per 5,000 chars)

---

## File Structure

```
shakespearian-monkeys/
  index.html          — Game UI and DOM structure
  style.css           — Layout and animation styles (no color theming)
  scripts.ts          — All game logic (state, upgrades, rendering, save/load)
  words.ts            — ~10,000-word dictionary (Set for O(1) lookup)
  dist/
    scripts.js        — Compiled game logic
    words.js          — Compiled dictionary
  package.json        — npm scripts: build (tsc), lint (tsc --noEmit)
  tsconfig.json       — TypeScript compiler config
```

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
# or use a static file server:
npx serve .
```
