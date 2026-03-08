# Shakespearian Monkeys

An idle game inspired by the **infinite monkey theorem** — a troop of monkeys type random characters on typewriters, accidentally discovering real English words and earning bananas along the way.

> **Play the game:** [https://mako1688.github.io/shakspearian-monkeys/](https://mako1688.github.io/shakspearian-monkeys/)

> **Design principle:** no win condition, no cap. Growth is infinite. Every upgrade, every accidental word, every banana just makes the monkeys type faster on the way to forever.

---

## How It Works

You start with one monkey. Monkeys type random lowercase letters at a steady pace. Every letter earns **1 banana**. When the letters accidentally spell a real English word, the monkey earns **bonus bananas** based on the word's length, tier, and active multipliers.

Spend bananas on upgrades to hire more monkeys, make them type faster, and multiply their output. There is no manual clicking — everything is driven entirely by monkey generation.

---

## Visual Design

Each hired monkey is displayed as a compact column that looks like a continuously printing receipt. New characters appear at the top and flow downward. When a word is discovered, it **floats upward** from the monkey's name as an animated label, then fades out.

Monkeys are arranged in a responsive grid so more monkeys fill the screen as you hire them. The ticker display uses stable DOM diffing (append new characters, remove old ones) instead of full re-renders, eliminating visual jitter.

---

## Banana Economy

| Source | Base Bananas | Tier Multiplier |
|--------|-------------|-----------------|
| Each character typed | +1 | — |
| 3-letter word (Common) | +9 (3²) | ×1.0 |
| 4-letter word (Adept) | +16 (4²) | ×1.2 |
| 5-letter word (Skilled) | +25 (5²) | ×1.5 |
| 6-letter word (Expert) | +36 (6²) | ×2.0 |
| 7-letter word (Master) | +49 (7²) | ×3.0 |
| 8-letter word (Legendary) | +64 (8²) | ×5.0 |
| 9-letter word (Mythical) | +81 (9²) | ×8.0 |
| 10-letter word (Shakespearian) | +100 (10²) | ×12.0 |

Word bonuses are further multiplied by per-monkey Word Mastery upgrades (×1.5 per level) and combo multipliers (finding multiple words within 3 seconds).

---

## Word Discovery System

### Word Detection

The dictionary (`words.ts`) contains ~10,000 common English words (3–10 letters). After every character is generated, the rolling buffer is checked from the longest possible match (10 chars) down to the shortest (3 chars).

### Word Length Tiers

Longer words earn progressively larger bonuses through tier multipliers (see table above). A 10-letter word earns 12× the base bonus, making rare long-word discoveries highly rewarding.

### Milestones

Reaching unique word count thresholds awards one-time banana bonuses:

| Milestone | Unique Words | Reward |
|-----------|-------------|--------|
| Novice Lexicon | 10 | 500 |
| Budding Vocabulary | 25 | 2,000 |
| Wordsmith | 50 | 10,000 |
| Linguist | 100 | 50,000 |
| Scholar | 200 | 250,000 |
| Bard | 500 | 1,000,000 |
| Shakespeare | 1,000 | 10,000,000 |

### Sentence Generation

Once monkeys have discovered at least 5 unique words, they periodically combine discovered words into sentences using templates (e.g., "the [word] is [word]"). Each generated sentence awards bonus bananas based on its word count.

---

## Combo System

Words found within 3 seconds of each other build a combo:

- Combo 1: no bonus
- Combo 2: ×1.1
- Combo N: ×(1 + (N−1) × 0.1)

The combo counter resets after 3 seconds with no word found.

---

## Upgrades

### All Monkeys (Global)

| Upgrade | Base Cost | Cost Scaling | Effect |
|---------|-----------|-------------|--------|
| Hire Monkey | 50 bananas | ×1.55 | +1 new monkey |
| Better Typewriters | 750 bananas | ×1.75 | +1 LPS per monkey |
| Monkey Training | 8,000 bananas | ×2.50 | ×1.5 LPS multiplier (all) |
| Golden Quill | 150,000 bananas | ×4.00 | ×3 LPS multiplier (all) |

### Individual Monkeys (Per-Monkey)

| Upgrade | Base Cost | Cost Scaling | Effect |
|---------|-----------|-------------|--------|
| Speed Boost | 120 bananas | ×1.55 | +1 LPS for this monkey |
| Word Mastery | 600 bananas | ×1.80 | ×1.5 word bonus for this monkey |

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

---

## Future Improvement Ideas

### Mid-Game Progression

- **Prestige system**: Reset progress for permanent multipliers that scale with total bananas earned, adding a strategic "when to reset" decision layer.
- **Monkey specialization**: Let players assign monkeys to focus on specific word lengths or letter ranges, creating meaningful build choices.
- **Technology tree**: Unlock branching upgrade paths (e.g., "Speed vs. Discovery" branches) so players make meaningful trade-off decisions.

### Choice-Based Gameplay

- **Monkey roles**: Assign roles like "Scribe" (faster typing), "Scholar" (better word detection), or "Poet" (sentence bonuses) to each monkey.
- **Research queue**: Spend words to unlock new mechanics instead of just earning bananas, adding a resource management layer.
- **Word challenges**: Timed events that reward finding specific word categories (e.g., "Find 5 animal words in 60 seconds").
- **Monkey traits**: Random traits on hire (e.g., "Lucky" = higher word find rate, "Stubborn" = types faster but no word bonus) that add variety and decision-making.

### Late-Game Content

- **Paragraph and passage generation**: Extend sentence generation into multi-sentence passages for exponentially larger rewards.
- **Literary achievements**: Hidden achievements for discovering specific Shakespeare-related words or phrases.
- **Monkey guilds**: Group monkeys into teams that share bonuses, with guild-level upgrades.
- **Offline expedition system**: Send idle monkeys on "literary expeditions" that complete over real time for large word/banana payouts.

### Quality of Life

- **Statistics dashboard**: Track words per minute, most productive monkey, longest word streak, and other engagement metrics.
- **Export/import saves**: Base64 save codes for sharing progress or backing up.
- **Dark/light theme toggle**: Support user preference for visual comfort.
- **Sound effects**: Optional typewriter sounds and word discovery chimes.
