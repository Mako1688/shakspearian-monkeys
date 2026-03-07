/* ============================================
   Shakespearian Monkeys – Game Logic
   ============================================ */

// --------------- Constants & Types ---------------

const SAVE_KEY = "shakespearian-monkeys-save";
const AUTO_SAVE_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 100; // 10 ticks per second

interface UpgradeDef {
  baseCost: number;
  costMultiplier: number;
  lpsAdd: number;       // flat LPS added per unit
  lpsMultiplier: number; // multiplicative bonus per unit
}

interface GameState {
  bananas: number;
  totalLetters: number;
  clickPower: number;
  upgrades: Record<UpgradeId, number>;
  quoteIndex: number;
  quoteCharIndex: number;
  lastSaveTime: number;
}

type UpgradeId = "monkey" | "typewriter" | "training" | "quill";

const UPGRADE_DEFS: Record<UpgradeId, UpgradeDef> = {
  monkey:     { baseCost: 10,   costMultiplier: 1.15, lpsAdd: 1,  lpsMultiplier: 1 },
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

function defaultState(): GameState {
  return {
    bananas: 0,
    totalLetters: 0,
    clickPower: 1,
    upgrades: { monkey: 0, typewriter: 0, training: 0, quill: 0 },
    quoteIndex: 0,
    quoteCharIndex: 0,
    lastSaveTime: Date.now(),
  };
}

let state: GameState = defaultState();

// --------------- Derived Values ---------------

function getUpgradeCost(id: UpgradeId): number {
  const def = UPGRADE_DEFS[id];
  return Math.floor(def.baseCost * Math.pow(def.costMultiplier, state.upgrades[id]));
}

function getLettersPerSecond(): number {
  let baseLps = 0;
  const ids = Object.keys(UPGRADE_DEFS) as UpgradeId[];
  for (const id of ids) {
    baseLps += UPGRADE_DEFS[id].lpsAdd * state.upgrades[id];
  }

  let multiplier = 1;
  for (const id of ids) {
    if (UPGRADE_DEFS[id].lpsMultiplier > 1 && state.upgrades[id] > 0) {
      multiplier *= Math.pow(UPGRADE_DEFS[id].lpsMultiplier, state.upgrades[id]);
    }
  }

  return baseLps * multiplier;
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

function renderAll(): void {
  renderStats();
  renderUpgrades();
  renderTypewriter();
  renderAchievements();
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
    return merged;
  } catch {
    return null;
  }
}

function resetGame(): void {
  if (confirm("Are you sure you want to reset all progress?")) {
    localStorage.removeItem(SAVE_KEY);
    state = defaultState();
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
  const lps = getLettersPerSecond();
  const lettersThisTick = lps / (1000 / TICK_INTERVAL_MS);

  if (lettersThisTick > 0) {
    addLetters(lettersThisTick);
  }

  renderStats();
  renderUpgrades();
  renderTypewriter();
}

// --------------- Initialization ---------------

function init(): void {
  // Load saved state
  const saved = loadGame();
  if (saved) {
    state = saved;
    handleOfflineProgress();
  }

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
