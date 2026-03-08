/* ============================================
   Shakespearian Monkeys – Game Logic
   ============================================ */

// --------------- Constants & Types ---------------

const SAVE_KEY = "shakespearian-monkeys-save";
const AUTO_SAVE_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 100; // 10 ticks per second

// --------------- Monkey Tier System ---------------
// Each hired monkey is tracked individually. Monkeys start at tier 0 (typing random
// characters). When they accidentally accumulate enough "words" they graduate to tier 1
// (typing random words) and eventually tier 2 (typing full sentences).

/** LPS each monkey contributes based on its current tier. */
const TIER_LPS: readonly number[] = [1, 5, 25];

/** How many characters a monkey must type before a word is "found by accident". */
const CHARS_PER_WORD = 50;

/** Words a monkey must find at tier 0 to reach tier 1, and at tier 1 to reach tier 2. */
const WORDS_TO_NEXT_TIER: readonly number[] = [10, 30];

/** Ticks the word-found flash stays visible on a ticker. */
const WORD_FLASH_TICKS = 8;

/** Ticks the graduation glow stays visible on a ticker. */
const GRADUATION_FLASH_TICKS = 30;

/** Maximum number of monkey tickers rendered simultaneously. */
const MAX_VISIBLE_TICKERS = 8;

/** Character pool for tier-0 monkey tickers. */
const RAND_CHARS = "abcdefghijklmnopqrstuvwxyz     .,";

/** Display labels for each tier. */
const TIER_NAMES = ["Letters", "Words", "Sentences"] as const;

/** Emoji icons for each tier. */
const TIER_EMOJIS = ["🔤", "📝", "📖"] as const;

/** Word pool used for tier-1 monkey tickers and word-found signals. */
const RANDOM_WORDS: string[] = [
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "it",
  "for", "not", "on", "with", "he", "as", "you", "do", "at", "this",
  "but", "his", "by", "from", "they", "we", "say", "her", "she", "or",
  "an", "will", "my", "one", "all", "would", "there", "their", "what",
  "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
  "when", "make", "can", "like", "time", "no", "just", "know", "take",
  "people", "year", "your", "good", "some", "could", "them", "see",
  "other", "than", "then", "now", "look", "only", "come", "its", "over",
  "think", "also", "back", "after", "use", "how", "our", "work", "first",
  "well", "way", "even", "new", "want", "any", "these", "give", "day",
];

interface UpgradeDef {
  baseCost: number;
  costMultiplier: number;
  lpsAdd: number;       // flat LPS added per unit (non-monkey upgrades)
  lpsMultiplier: number; // multiplicative bonus per unit
}

/** Per-monkey state tracked individually for the ticker + prestige system. */
interface MonkeyData {
  id: number;
  tier: 0 | 1 | 2;
  charAccum: number;       // accumulated chars toward next word-find event
  wordsFound: number;      // words found at current tier (toward graduation)
  totalWords: number;      // all-time words found across all tiers
  ticker: string;          // live text shown in this monkey's ticker box
  flashTicks: number;      // countdown for the word-found flash
  graduationTicks: number; // countdown for the graduation glow
  lastWord: string;        // most recently found word (shown during flash)
}

interface GameState {
  bananas: number;
  totalLetters: number;
  clickPower: number;
  upgrades: Record<UpgradeId, number>;
  quoteIndex: number;
  quoteCharIndex: number;
  lastSaveTime: number;
  monkeys: MonkeyData[];
  nextMonkeyId: number;
}

type UpgradeId = "monkey" | "typewriter" | "training" | "quill";

const UPGRADE_DEFS: Record<UpgradeId, UpgradeDef> = {
  // monkey lpsAdd is 0 – LPS now comes from TIER_LPS per individual monkey
  monkey:     { baseCost: 10,   costMultiplier: 1.15, lpsAdd: 0,  lpsMultiplier: 1 },
  typewriter: { baseCost: 50,   costMultiplier: 1.25, lpsAdd: 5,  lpsMultiplier: 1 },
  training:   { baseCost: 500,  costMultiplier: 1.50, lpsAdd: 0,  lpsMultiplier: 2 },
  quill:      { baseCost: 5000, costMultiplier: 1.75, lpsAdd: 0,  lpsMultiplier: 10 },
};

const SHAKESPEARE_QUOTES: string[] = [
  "To be, or not to be, that is the question.",
  "All that glitters is not gold.",
  "The lady doth protest too much, methinks.",
  "What's in a name? That which we call a rose by any other name would smell as sweet.",
  "Though she be but little, she is fierce.",
  "Love all, trust a few, do wrong to none.",
  "We know what we are, but know not what we may be.",
  "The course of true love never did run smooth.",
  "Brevity is the soul of wit.",
  "If music be the food of love, play on.",
  "All the world's a stage, and all the men and women merely players.",
  "There is nothing either good or bad, but thinking makes it so.",
  "Some are born great, some achieve greatness, and some have greatness thrust upon them.",
  "Cowards die many times before their deaths; the valiant never taste of death but once.",
  "A fool thinks himself to be wise, but a wise man knows himself to be a fool.",
];

// --------------- State ---------------

function defaultMonkey(id: number): MonkeyData {
  return {
    id,
    tier: 0,
    charAccum: 0,
    wordsFound: 0,
    totalWords: 0,
    ticker: "",
    flashTicks: 0,
    graduationTicks: 0,
    lastWord: "",
  };
}

function defaultState(): GameState {
  return {
    bananas: 0,
    totalLetters: 0,
    clickPower: 1,
    upgrades: { monkey: 0, typewriter: 0, training: 0, quill: 0 },
    quoteIndex: 0,
    quoteCharIndex: 0,
    lastSaveTime: Date.now(),
    monkeys: [],
    nextMonkeyId: 0,
  };
}

let state: GameState = defaultState();
/** Counts every game tick; used to stagger visual ticker updates across monkeys. */
let globalTickCount = 0;

// --------------- Derived Values ---------------

function getUpgradeCost(id: UpgradeId): number {
  const def = UPGRADE_DEFS[id];
  return Math.floor(def.baseCost * Math.pow(def.costMultiplier, state.upgrades[id]));
}

/** Returns the combined training + quill LPS multiplier. */
function getGlobalMultiplier(): number {
  let multiplier = 1;
  for (const id of ["training", "quill"] as UpgradeId[]) {
    if (UPGRADE_DEFS[id].lpsMultiplier > 1 && state.upgrades[id] > 0) {
      multiplier *= Math.pow(UPGRADE_DEFS[id].lpsMultiplier, state.upgrades[id]);
    }
  }
  return multiplier;
}

function getLettersPerSecond(): number {
  let baseLps = 0;

  // Sum LPS from each individual monkey based on its current tier
  for (const monkey of state.monkeys) {
    baseLps += TIER_LPS[monkey.tier];
  }

  // Typewriters still contribute flat LPS
  baseLps += UPGRADE_DEFS.typewriter.lpsAdd * state.upgrades.typewriter;

  return baseLps * getGlobalMultiplier();
}

/** Effective character-per-word threshold, reduced by Training upgrades (10 % per level). */
function getCharsPerWord(): number {
  return Math.max(5, Math.floor(CHARS_PER_WORD * Math.pow(0.9, state.upgrades.training)));
}

// --------------- Random Helpers ---------------

function getRandomChar(): string {
  return RAND_CHARS[Math.floor(Math.random() * RAND_CHARS.length)];
}

function getRandomWord(): string {
  return RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)];
}

function getRandomQuote(): string {
  return SHAKESPEARE_QUOTES[Math.floor(Math.random() * SHAKESPEARE_QUOTES.length)];
}

// --------------- Individual Monkey Tick Update ---------------

/**
 * Advances one monkey's state by one game tick:
 *  • Updates its visual ticker string (characters / words / sentences depending on tier).
 *  • Accumulates chars toward the next word-find event.
 *  • Triggers graduation when enough words have been found.
 */
function updateMonkeyTicker(monkey: MonkeyData): void {
  // Count down flash timers
  if (monkey.flashTicks > 0) monkey.flashTicks--;
  if (monkey.graduationTicks > 0) monkey.graduationTicks--;

  // ── Visual ticker update ────────────────────────────────────────────────
  // Use a staggered offset so multiple monkeys of the same tier don't update
  // in perfect lockstep, giving each ticker its own rhythm.
  const tickOffset = (globalTickCount + monkey.id * 3) | 0;

  switch (monkey.tier) {
    case 0:
      // One random character per tick → fast character stream
      monkey.ticker = (monkey.ticker + getRandomChar()).slice(-30);
      break;

    case 1:
      // One random word every ~15 ticks (~1.5 s)
      if (tickOffset % 15 === 0) {
        const w = getRandomWord();
        monkey.ticker = (monkey.ticker + " " + w).trimStart().slice(-60);
      }
      break;

    case 2:
      // A new Shakespeare sentence every ~60 ticks (~6 s)
      if (tickOffset % 60 === 0) {
        monkey.ticker = getRandomQuote();
      }
      break;
  }

  // ── Graduation / word-find accumulation ────────────────────────────────
  // Scale chars-per-tick by the monkey's own effective LPS so that training
  // and quill upgrades also speed up graduation.
  const monkeyLps = TIER_LPS[monkey.tier] * getGlobalMultiplier();
  const charsThisTick = monkeyLps / (1000 / TICK_INTERVAL_MS);
  monkey.charAccum += charsThisTick;

  const cpw = getCharsPerWord();
  if (monkey.charAccum >= cpw) {
    monkey.charAccum -= cpw;

    // A word was typed "by accident"!
    monkey.lastWord = getRandomWord();
    monkey.wordsFound++;
    monkey.totalWords++;
    monkey.flashTicks = WORD_FLASH_TICKS;

    // Check for tier graduation
    if (monkey.tier < 2) {
      const threshold = WORDS_TO_NEXT_TIER[monkey.tier];
      if (monkey.wordsFound >= threshold) {
        monkey.tier = (monkey.tier + 1) as 0 | 1 | 2;
        monkey.wordsFound = 0;
        monkey.charAccum = 0;
        monkey.ticker = "";
        monkey.flashTicks = 0;
        monkey.graduationTicks = GRADUATION_FLASH_TICKS;
      }
    }
  }
}

// --------------- DOM References ---------------

function getElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

const dom = {
  bananas: () => getElement("bananas"),
  lps: () => getElement("lps"),
  totalLetters: () => getElement("total-letters"),
  typewriterOutput: () => getElement("typewriter-output"),
  progressBar: () => getElement("progress-bar"),
  progressText: () => getElement("progress-text"),
  clickBtn: () => getElement("click-btn"),
  achievementsList: () => getElement("achievements-list"),
  monkeysList: () => getElement("monkeys-list"),
  offlineModal: () => getElement("offline-modal"),
  offlineEarnings: () => getElement("offline-earnings"),
  offlineClose: () => getElement("offline-close"),
  saveBtn: () => getElement("save-btn"),
  resetBtn: () => getElement("reset-btn"),
};

// --------------- Formatting ---------------

function formatNumber(n: number): string {
  if (n < 1_000) return Math.floor(n).toString();
  if (n < 1_000_000) return (n / 1_000).toFixed(1) + "K";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(2) + "M";
  return (n / 1_000_000_000).toFixed(2) + "B";
}

// --------------- Rendering ---------------

function renderStats(): void {
  dom.bananas().textContent = formatNumber(state.bananas);
  dom.lps().textContent = formatNumber(getLettersPerSecond());
  dom.totalLetters().textContent = formatNumber(state.totalLetters);
}

function renderUpgrades(): void {
  const ids = Object.keys(UPGRADE_DEFS) as UpgradeId[];
  for (const id of ids) {
    const costEl = document.getElementById(`cost-${id}`);
    const ownedEl = document.getElementById(`owned-${id}`);
    const btn = document.querySelector(`[data-upgrade="${id}"]`) as HTMLButtonElement | null;

    if (costEl) costEl.textContent = formatNumber(getUpgradeCost(id));
    if (ownedEl) ownedEl.textContent = state.upgrades[id].toString();
    if (btn) btn.disabled = state.bananas < getUpgradeCost(id);
  }
}

function renderTypewriter(): void {
  const output = dom.typewriterOutput();
  const currentQuote = SHAKESPEARE_QUOTES[state.quoteIndex % SHAKESPEARE_QUOTES.length];
  const typed = currentQuote.slice(0, state.quoteCharIndex);

  output.textContent = typed;
  // auto-scroll
  output.scrollTop = output.scrollHeight;

  // Progress bar
  const pct = currentQuote.length > 0
    ? Math.floor((state.quoteCharIndex / currentQuote.length) * 100)
    : 0;
  dom.progressBar().style.width = pct + "%";
  dom.progressText().textContent = pct + "%";
}

function renderAchievements(): void {
  const list = dom.achievementsList();
  list.innerHTML = "";

  for (let i = 0; i < SHAKESPEARE_QUOTES.length; i++) {
    const div = document.createElement("div");
    const completed = i < state.quoteIndex;
    const current = i === state.quoteIndex;
    div.className = `achievement ${completed ? "completed" : "locked"}`;

    const name = document.createElement("span");
    name.className = "achievement-name";
    name.textContent = completed || current
      ? `"${SHAKESPEARE_QUOTES[i].slice(0, 35)}…"`
      : `Quote #${i + 1} (locked)`;

    const status = document.createElement("span");
    status.className = "achievement-status";
    status.textContent = completed ? "✅ Complete" : current ? "📝 In progress" : "🔒";

    div.appendChild(name);
    div.appendChild(status);
    list.appendChild(div);
  }
}

/**
 * (Re)builds the monkey ticker DOM from scratch.
 * Call only when the monkey list changes (hire, reset, load).
 */
function buildMonkeyTickers(): void {
  const list = dom.monkeysList();
  list.innerHTML = "";

  if (state.monkeys.length === 0) {
    const msg = document.createElement("p");
    msg.className = "no-monkeys-msg";
    msg.textContent = "Hire a monkey to get started!";
    list.appendChild(msg);
    return;
  }

  const visible = state.monkeys.slice(0, MAX_VISIBLE_TICKERS);
  for (const monkey of visible) {
    const tierMax = monkey.tier < 2
      ? String(WORDS_TO_NEXT_TIER[monkey.tier])
      : "MAX";

    const el = document.createElement("div");
    el.className = "monkey-ticker";
    el.id = `monkey-ticker-${monkey.id}`;

    // Header row
    const header = document.createElement("div");
    header.className = "ticker-header";

    const badge = document.createElement("span");
    badge.className = `tier-badge tier-${monkey.tier}`;
    badge.textContent = `${TIER_EMOJIS[monkey.tier]} ${TIER_NAMES[monkey.tier]}`;

    const label = document.createElement("span");
    label.className = "monkey-label";
    label.textContent = `Monkey #${monkey.id + 1}`;

    const progress = document.createElement("span");
    progress.className = "monkey-progress";
    progress.textContent = monkey.tier < 2
      ? `${monkey.wordsFound}/${tierMax} words`
      : `✅ MAX`;

    header.appendChild(badge);
    header.appendChild(label);
    header.appendChild(progress);

    // Ticker display
    const display = document.createElement("div");
    display.className = "ticker-display";
    display.textContent = monkey.ticker || "…";

    // Word-found flash row
    const event = document.createElement("div");
    event.className = "ticker-event";
    event.style.display = "none";

    el.appendChild(header);
    el.appendChild(display);
    el.appendChild(event);
    list.appendChild(el);
  }

  if (state.monkeys.length > MAX_VISIBLE_TICKERS) {
    const more = document.createElement("p");
    more.className = "monkeys-more";
    more.textContent = `…and ${state.monkeys.length - MAX_VISIBLE_TICKERS} more monkeys working!`;
    list.appendChild(more);
  }
}

/**
 * Updates only the text content / CSS classes of existing ticker elements.
 * Called every game tick — does NOT rebuild DOM nodes.
 */
function updateMonkeyTickers(): void {
  const visible = state.monkeys.slice(0, MAX_VISIBLE_TICKERS);

  for (const monkey of visible) {
    const tickerEl = document.getElementById(`monkey-ticker-${monkey.id}`);
    if (!tickerEl) continue;

    // Ticker text
    const displayEl = tickerEl.querySelector<HTMLElement>(".ticker-display");
    if (displayEl) displayEl.textContent = monkey.ticker || "…";

    // Progress toward graduation
    const progEl = tickerEl.querySelector<HTMLElement>(".monkey-progress");
    if (progEl) {
      if (monkey.tier < 2) {
        const threshold = WORDS_TO_NEXT_TIER[monkey.tier];
        progEl.textContent = `${monkey.wordsFound}/${threshold} words`;
      } else {
        progEl.textContent = "✅ MAX";
      }
    }

    // Tier badge (may have changed after graduation)
    const badgeEl = tickerEl.querySelector<HTMLElement>(".tier-badge");
    if (badgeEl) {
      badgeEl.className = `tier-badge tier-${monkey.tier}`;
      badgeEl.textContent = `${TIER_EMOJIS[monkey.tier]} ${TIER_NAMES[monkey.tier]}`;
    }

    // Word-found flash
    const eventEl = tickerEl.querySelector<HTMLElement>(".ticker-event");
    if (eventEl) {
      if (monkey.flashTicks > 0) {
        eventEl.textContent = `✨ "${monkey.lastWord}"`;
        eventEl.style.display = "";
      } else {
        eventEl.style.display = "none";
      }
    }

    // CSS animation classes
    tickerEl.classList.toggle("word-flash", monkey.flashTicks > 0);
    tickerEl.classList.toggle("graduated", monkey.graduationTicks > 0);
  }
}

function renderAll(): void {
  renderStats();
  renderUpgrades();
  renderTypewriter();
  renderAchievements();
  updateMonkeyTickers();
}

// --------------- Game Logic ---------------

function addLetters(amount: number): void {
  state.bananas += amount;
  state.totalLetters += amount;

  // Advance through quotes
  let remaining = amount;
  while (remaining > 0) {
    const currentQuote = SHAKESPEARE_QUOTES[state.quoteIndex % SHAKESPEARE_QUOTES.length];
    const charsNeeded = currentQuote.length - state.quoteCharIndex;

    if (remaining >= charsNeeded) {
      remaining -= charsNeeded;
      state.quoteCharIndex = 0;
      state.quoteIndex = (state.quoteIndex + 1) % SHAKESPEARE_QUOTES.length;
    } else {
      state.quoteCharIndex += Math.floor(remaining);
      remaining = 0;
    }
  }
}

function handleClick(): void {
  addLetters(state.clickPower);
  renderAll();
}

function purchaseUpgrade(id: UpgradeId): void {
  const cost = getUpgradeCost(id);
  if (state.bananas >= cost) {
    state.bananas -= cost;
    state.upgrades[id]++;
    if (id === "monkey") {
      // Create an individual tracked monkey for the new hire
      state.monkeys.push(defaultMonkey(state.nextMonkeyId++));
      buildMonkeyTickers(); // Rebuild ticker list to include the new monkey
    }
    renderAll();
  }
}

// --------------- Save / Load ---------------

function saveGame(): void {
  state.lastSaveTime = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage might be full or unavailable; silently fail
  }
}

function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameState>;

    // Merge with defaults to handle missing fields from older saves
    const merged: GameState = { ...defaultState(), ...parsed };
    merged.upgrades = { ...defaultState().upgrades, ...(parsed.upgrades ?? {}) };

    // Migrate saves that pre-date individual monkey tracking:
    // if upgrades.monkey says N but the monkeys array is shorter, fill it up.
    if (!Array.isArray(merged.monkeys)) {
      merged.monkeys = [];
      merged.nextMonkeyId = 0;
    }
    while (merged.monkeys.length < merged.upgrades.monkey) {
      merged.monkeys.push(defaultMonkey(merged.nextMonkeyId++));
    }

    return merged;
  } catch {
    return null;
  }
}

function resetGame(): void {
  if (confirm("Are you sure you want to reset all progress?")) {
    localStorage.removeItem(SAVE_KEY);
    state = defaultState();
    buildMonkeyTickers(); // Clear ticker UI
    renderAll();
  }
}

function handleOfflineProgress(): void {
  const now = Date.now();
  const elapsed = (now - state.lastSaveTime) / 1000; // seconds
  if (elapsed < 10) return; // less than 10s, skip

  const lps = getLettersPerSecond();
  if (lps <= 0) return;

  // Cap offline earnings at 8 hours
  const cappedElapsed = Math.min(elapsed, 8 * 60 * 60);
  const offlineLetters = Math.floor(lps * cappedElapsed);

  if (offlineLetters > 0) {
    addLetters(offlineLetters);

    dom.offlineEarnings().textContent = formatNumber(offlineLetters);
    dom.offlineModal().classList.remove("hidden");
  }
}

// --------------- Game Loop ---------------

function gameTick(): void {
  globalTickCount++;

  const lps = getLettersPerSecond();
  const lettersThisTick = lps / (1000 / TICK_INTERVAL_MS);

  if (lettersThisTick > 0) {
    addLetters(lettersThisTick);
  }

  // Advance each monkey's individual ticker state
  for (const monkey of state.monkeys) {
    updateMonkeyTicker(monkey);
  }

  renderStats();
  renderUpgrades();
  renderTypewriter();
  updateMonkeyTickers();
}

// --------------- Initialization ---------------

function init(): void {
  // Load saved state
  const saved = loadGame();
  if (saved) {
    state = saved;
    handleOfflineProgress();
  }

  buildMonkeyTickers(); // Build ticker DOM before first render
  renderAll();

  // Click button
  dom.clickBtn().addEventListener("click", handleClick);

  // Upgrade buttons
  const upgradeButtons = document.querySelectorAll<HTMLButtonElement>(".upgrade-btn");
  upgradeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.upgrade as UpgradeId;
      if (id) purchaseUpgrade(id);
    });
  });

  // Modal close
  dom.offlineClose().addEventListener("click", () => {
    dom.offlineModal().classList.add("hidden");
  });

  // Save / Reset
  dom.saveBtn().addEventListener("click", saveGame);
  dom.resetBtn().addEventListener("click", resetGame);

  // Game loop
  setInterval(gameTick, TICK_INTERVAL_MS);

  // Auto-save
  setInterval(saveGame, AUTO_SAVE_INTERVAL_MS);

  // Save on page unload
  window.addEventListener("beforeunload", saveGame);
}

// Start the game when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
