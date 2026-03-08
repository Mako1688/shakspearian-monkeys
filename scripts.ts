/* ============================================
   Shakespearian Monkeys – Game Logic
   ============================================ */

import { WORD_SET } from './words.js';

// --------------- Constants & Types ---------------

const SAVE_KEY = "shakespearian-monkeys-save";
const AUTO_SAVE_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 100; // 10 ticks per second

const MAX_WORD_LENGTH = 10;
const MIN_WORD_LENGTH = 3;
const COMBO_WINDOW_MS = 3000; // 3 seconds for combo
const MAX_TICKER_HISTORY = 20; // recent words per monkey ticker
const MAX_DISPLAY_CHARS = 80; // chars to keep in vertical receipt
const MAX_RECENT_WORDS = 10;
const MAX_LPS_PER_MONKEY = 200; // hard cap to prevent browser hangs

// Words that appear in the dictionary but are not real everyday words
const BANNED_WORDS = new Set([
  "iii", "iiii", "vii", "viii", "xii", "xiii", "xiv", "xvi", "xvii", "xviii", "xix",
  "xxi", "xxii", "xxiii", "xxiv", "xxv", "xxvi", "xxvii", "xxix", "xxx",
  "xxxi", "xxxii", "xxxiii", "xxxiv", "xxxv", "xxxix",
  "lii", "liii", "liv", "lvi", "lvii", "lviii", "lix",
  "lxi", "lxii", "lxiii", "lxiv", "lxv", "lxvi", "lxvii", "lxix",
  "xcii", "xciii", "xciv", "xcvi", "xcvii", "xcix",
  "aaa", "bbb", "ccc", "ddd", "eee", "fff", "ggg", "hhh",
  "jjj", "kkk", "lll", "mmm", "nnn", "ooo", "ppp", "qqq",
  "rrr", "sss", "ttt", "uuu", "vvv", "www", "yyy", "zzz",
  "abcs", "abcd", "zzzz",
]);

const MONKEY_NAMES = [
  "Hamlet", "Othello", "Macbeth", "Prospero", "Oberon",
  "Puck", "Ariel", "Caliban", "Romeo", "Juliet",
  "Portia", "Viola", "Rosalind", "Titania", "Bottom",
  "Falstaff", "Lear", "Cordelia", "Edgar", "Kent",
  "Horatio", "Ophelia", "Claudius", "Mercutio", "Benvolio",
  "Tybalt", "Shylock", "Beatrice", "Benedick", "Petruchio",
  "Miranda", "Sebastian", "Antonio", "Lysander", "Helena",
  "Hermia", "Demetrius", "Malvolio", "Feste", "Touchstone",
  "Jaques", "Orlando", "Celia", "Bianca", "Cassio",
  "Desdemona", "Emilia", "Iago", "Banquo", "Duncan",
];

// --------------- Upgrade Definitions ---------------

interface UpgradeDef {
  name: string;
  desc: string;
  baseCost: bigint;
  costMult: number;
}

// Costs are much higher and scaling is steeper to prevent runaway progression.
// Training gives +1.5x (not 2x) per level; Quill gives +3x (not 10x).
const GLOBAL_UPGRADES: Record<string, UpgradeDef> = {
  monkey:     { name: "Hire Monkey",        desc: "+1 new monkey typist",          baseCost: 15n,    costMult: 1.50 },
  typewriter: { name: "Better Typewriters",  desc: "+1 LPS per monkey",            baseCost: 250n,   costMult: 1.65 },
  training:   { name: "Monkey Training",     desc: "1.5x LPS multiplier (all)",    baseCost: 2000n,  costMult: 2.20 },
  quill:      { name: "Golden Quill",        desc: "3x LPS multiplier (all)",      baseCost: 40000n, costMult: 3.50 },
};

const MONKEY_UPGRADE_DEFS: Record<string, UpgradeDef> = {
  speed: { name: "Speed Boost",  desc: "+1 LPS for this monkey", baseCost: 40n,  costMult: 1.45 },
  bonus: { name: "Word Mastery", desc: "1.5x word bonus",        baseCost: 200n, costMult: 1.65 },
};

// --------------- State Types ---------------

interface MonkeyData {
  id: number;
  name: string;
  buffer: string;
  displayChars: string;
  tickerHistory: string[]; // recent words, capped at MAX_TICKER_HISTORY
  wordsFound: number;
  speedLevel: number;
  bonusLevel: number;
}

interface SaveState {
  bananas: string;
  totalLetters: string;
  globalUpgrades: Record<string, number>;
  monkeys: MonkeyData[];
  recentWords: string[];
  wordCounts: Record<string, number>;
  totalWordsFound: number;
  lastWordTime: number;
  comboCount: number;
  lastSaveTime: number;
}

// --------------- Runtime State ---------------

let bananas: bigint = 0n;
let totalLetters: bigint = 0n;

let globalUpgrades: Record<string, number> = { monkey: 0, typewriter: 0, training: 0, quill: 0 };

let monkeys: MonkeyData[] = [];

let recentWords: string[] = [];
let wordCounts: Record<string, number> = {};
let totalWordsFound = 0;

let lastWordTime = 0;
let comboCount = 0;
let lastSaveTime = Date.now();

let activeTab = "global";

// Accumulator for fractional chars per monkey per tick
let monkeyCharAccumulators: number[] = [];

// --------------- Derived Values ---------------

function getUpgradeCost(defs: Record<string, UpgradeDef>, id: string, level: number): bigint {
  const def = defs[id];
  return BigInt(Math.floor(Number(def.baseCost) * Math.pow(def.costMult, level)));
}

function getMonkeyLPS(monkey: MonkeyData): number {
  const base = 1 + globalUpgrades.typewriter + monkey.speedLevel;
  // Training: 1.5x per level (was 2x), Quill: 3x per level (was 10x)
  let mult = 1;
  if (globalUpgrades.training > 0) mult *= Math.pow(1.5, globalUpgrades.training);
  if (globalUpgrades.quill > 0) mult *= Math.pow(3, globalUpgrades.quill);
  // Hard cap to prevent browser hangs from extreme upgrade stacking
  return Math.min(base * mult, MAX_LPS_PER_MONKEY);
}

function getTotalLPS(): number {
  let total = 0;
  for (const m of monkeys) {
    total += getMonkeyLPS(m);
  }
  return total;
}

function getWordBonus(word: string, monkey?: MonkeyData): bigint {
  let bonus = BigInt(word.length * word.length);

  // Per-monkey bonus
  if (monkey && monkey.bonusLevel > 0) {
    const mult = Math.pow(1.5, monkey.bonusLevel);
    bonus = BigInt(Math.floor(Number(bonus) * mult));
  }

  // Combo bonus
  const now = Date.now();
  if (now - lastWordTime < COMBO_WINDOW_MS && lastWordTime > 0) {
    comboCount++;
  } else {
    comboCount = 1;
  }
  lastWordTime = now;

  if (comboCount > 1) {
    const comboMult = 1 + (comboCount - 1) * 0.1;
    bonus = BigInt(Math.floor(Number(bonus) * comboMult));
  }

  return bonus;
}

// --------------- Word Detection ---------------

function checkForWordInBuffer(buffer: string, monkey?: MonkeyData): { word: string; bonus: bigint } | null {
  for (let len = Math.min(buffer.length, MAX_WORD_LENGTH); len >= MIN_WORD_LENGTH; len--) {
    const candidate = buffer.slice(-len);
    if (WORD_SET.has(candidate) && !BANNED_WORDS.has(candidate)) {
      const bonus = getWordBonus(candidate, monkey);
      return { word: candidate, bonus };
    }
  }
  return null;
}

// --------------- Character Generation ---------------

// Queue of word discoveries to animate in the next render cycle
interface WordFloatEvent { monkeyId: number; word: string; bonus: bigint; }
const pendingWordFloats: WordFloatEvent[] = [];

function generateCharsForMonkey(monkey: MonkeyData, amount: number): void {
  const chars = Math.floor(amount);
  if (chars <= 0) return;

  bananas += BigInt(chars);
  totalLetters += BigInt(chars);

  for (let i = 0; i < chars; i++) {
    const char = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    monkey.buffer += char;
    monkey.displayChars += char;

    const result = checkForWordInBuffer(monkey.buffer, monkey);
    if (result) {
      bananas += result.bonus;
      totalWordsFound++;
      monkey.wordsFound++;
      wordCounts[result.word] = (wordCounts[result.word] || 0) + 1;
      recentWords.unshift(result.word);
      if (recentWords.length > MAX_RECENT_WORDS) recentWords.pop();

      monkey.tickerHistory.unshift(result.word + " (+" + result.bonus.toString() + ")");
      if (monkey.tickerHistory.length > MAX_TICKER_HISTORY) monkey.tickerHistory.pop();

      // Queue a float animation for the render cycle
      pendingWordFloats.push({ monkeyId: monkey.id, word: result.word, bonus: result.bonus });

      monkey.buffer = "";
    }

    if (monkey.buffer.length > MAX_WORD_LENGTH) {
      monkey.buffer = monkey.buffer.slice(-MAX_WORD_LENGTH);
    }
  }

  if (monkey.displayChars.length > MAX_DISPLAY_CHARS) {
    monkey.displayChars = monkey.displayChars.slice(-MAX_DISPLAY_CHARS);
  }
}

// --------------- Formatting ---------------

function formatBigInt(n: bigint): string {
  if (n < 0n) return "-" + formatBigInt(-n);
  const s = n.toString();
  const len = s.length;
  if (len <= 3) return s;

  const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  const tierIndex = Math.min(Math.floor((len - 1) / 3), suffixes.length - 1);
  const divisorDigits = tierIndex * 3;

  const sigPart = s.substring(0, len - divisorDigits);
  const fracPart = s.substring(len - divisorDigits, len - divisorDigits + 2).padEnd(2, "0");

  if (sigPart.length === 1) return sigPart + "." + fracPart + suffixes[tierIndex];
  if (sigPart.length === 2) return sigPart + "." + fracPart.charAt(0) + suffixes[tierIndex];
  return sigPart + suffixes[tierIndex];
}

function formatNumber(n: number): string {
  return formatBigInt(BigInt(Math.floor(n)));
}

// --------------- DOM Helpers ---------------

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

// --------------- Rendering ---------------

function renderStats(): void {
  getEl("bananas").textContent = formatBigInt(bananas);
  getEl("lps").textContent = formatNumber(getTotalLPS());
  getEl("total-letters").textContent = formatBigInt(totalLetters);
  getEl("total-words").textContent = totalWordsFound.toString();

  const comboEl = getEl("combo");
  if (comboCount > 1 && Date.now() - lastWordTime < COMBO_WINDOW_MS) {
    comboEl.textContent = comboCount + "x";
    comboEl.classList.add("combo-active");
  } else {
    comboEl.textContent = "--";
    comboEl.classList.remove("combo-active");
  }
}

// --------------- Word Float Animations ---------------

function flushWordFloats(): void {
  for (const evt of pendingWordFloats) {
    const headerEl = document.getElementById("monkey-header-" + evt.monkeyId);
    if (!headerEl) continue;

    const floater = document.createElement("span");
    floater.className = "word-floater";
    floater.textContent = evt.word + " +" + evt.bonus.toString();
    headerEl.appendChild(floater);
    floater.addEventListener("animationend", () => floater.remove(), { once: true });
  }
  pendingWordFloats.length = 0;
}

function renderMonkeyTickers(): void {
  const container = getEl("monkey-tickers-list");

  // Remove placeholder text if present
  const placeholder = container.querySelector(".no-monkeys");
  if (placeholder && monkeys.length > 0) placeholder.remove();

  // Create or update monkey ticker elements
  for (const monkey of monkeys) {
    let el = document.getElementById("monkey-ticker-" + monkey.id);
    if (!el) {
      // Build the ticker structure once; only update inner content each tick
      el = document.createElement("div");
      el.id = "monkey-ticker-" + monkey.id;
      el.className = "monkey-ticker";

      const header = document.createElement("div");
      header.id = "monkey-header-" + monkey.id;
      header.className = "monkey-ticker-header";

      const nameSpan = document.createElement("span");
      nameSpan.className = "monkey-name";
      nameSpan.textContent = monkey.name;

      const lpsSpan = document.createElement("span");
      lpsSpan.className = "monkey-lps";

      header.appendChild(nameSpan);
      header.appendChild(lpsSpan);

      const charsDiv = document.createElement("div");
      charsDiv.id = "monkey-chars-" + monkey.id;
      charsDiv.className = "monkey-chars";

      el.appendChild(header);
      el.appendChild(charsDiv);
      container.appendChild(el);
    }

    // Update LPS display
    const lpsSpan = el.querySelector(".monkey-lps") as HTMLElement | null;
    if (lpsSpan) lpsSpan.textContent = formatNumber(getMonkeyLPS(monkey)) + " LPS";

    // Update monkey name (may change via individual upgrades panel)
    const nameSpan = el.querySelector(".monkey-name") as HTMLElement | null;
    if (nameSpan) nameSpan.textContent = monkey.name;

    // Render vertical receipt-paper chars: newest char at top, oldest at bottom
    const charsDiv = document.getElementById("monkey-chars-" + monkey.id);
    if (charsDiv) {
      const chars = monkey.displayChars;
      // Build reversed char list so newest is at top
      const parts: string[] = [];
      for (let i = chars.length - 1; i >= 0; i--) {
        parts.push('<span class="ticker-char">' + escapeHtml(chars[i]) + '</span>');
      }
      charsDiv.innerHTML = parts.join('');
    }
  }

  // Remove tickers for monkeys that no longer exist
  const existingTickers = container.querySelectorAll(".monkey-ticker");
  existingTickers.forEach(ticker => {
    const id = parseInt(ticker.id.replace("monkey-ticker-", ""), 10);
    if (!monkeys.find(m => m.id === id)) {
      ticker.remove();
    }
  });

  // Flush queued word float animations
  flushWordFloats();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderUpgrades(): void {
  renderGlobalUpgrades();
  renderIndividualUpgrades();
}

function renderGlobalUpgrades(): void {
  const container = getEl("tab-global");
  container.innerHTML = "";

  for (const [id, def] of Object.entries(GLOBAL_UPGRADES)) {
    const level = globalUpgrades[id] || 0;
    const cost = getUpgradeCost(GLOBAL_UPGRADES, id, level);
    const canAfford = bananas >= cost;

    const btn = document.createElement("button");
    btn.className = "upgrade-btn" + (canAfford ? "" : " disabled");
    btn.disabled = !canAfford;
    btn.innerHTML =
      '<div class="upgrade-info">' +
        '<span class="upgrade-name">' + def.name + '</span>' +
        '<span class="upgrade-desc">' + def.desc + '</span>' +
      '</div>' +
      '<div class="upgrade-cost">Cost: ' + formatBigInt(cost) + '</div>' +
      '<div class="upgrade-owned">Owned: ' + level + '</div>';
    btn.addEventListener("click", () => purchaseGlobalUpgrade(id));
    container.appendChild(btn);
  }
}

function renderIndividualUpgrades(): void {
  const container = getEl("tab-individual");
  container.innerHTML = "";

  if (monkeys.length === 0) {
    container.innerHTML = '<p class="no-monkeys">Hire a monkey first!</p>';
    return;
  }

  for (const monkey of monkeys) {
    const card = document.createElement("div");
    card.className = "monkey-upgrade-card";

    // Name editing
    const nameRow = document.createElement("div");
    nameRow.className = "monkey-name-row";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "monkey-name-input";
    nameInput.value = monkey.name;
    nameInput.maxLength = 20;
    nameInput.addEventListener("change", () => {
      monkey.name = nameInput.value.trim() || ("Monkey " + monkey.id);
      renderMonkeyTickers();
    });
    nameRow.appendChild(nameInput);

    const statsRow = document.createElement("div");
    statsRow.className = "monkey-stats-row";
    statsRow.textContent = "LPS: " + formatNumber(getMonkeyLPS(monkey)) + " | Words: " + monkey.wordsFound;

    card.appendChild(nameRow);
    card.appendChild(statsRow);

    // Per-monkey upgrades
    for (const [uid, def] of Object.entries(MONKEY_UPGRADE_DEFS)) {
      const level = uid === "speed" ? monkey.speedLevel : monkey.bonusLevel;
      const cost = getUpgradeCost(MONKEY_UPGRADE_DEFS, uid, level);
      const canAfford = bananas >= cost;

      const btn = document.createElement("button");
      btn.className = "upgrade-btn small" + (canAfford ? "" : " disabled");
      btn.disabled = !canAfford;
      btn.innerHTML =
        '<div class="upgrade-info">' +
          '<span class="upgrade-name">' + def.name + '</span>' +
          '<span class="upgrade-desc">' + def.desc + '</span>' +
        '</div>' +
        '<div class="upgrade-cost">Cost: ' + formatBigInt(cost) + '</div>' +
        '<div class="upgrade-owned">Lv. ' + level + '</div>';
      btn.addEventListener("click", () => purchaseMonkeyUpgrade(monkey.id, uid));
      card.appendChild(btn);
    }

    container.appendChild(card);
  }
}

function renderWordDiscovery(): void {
  const list = getEl("recent-words-list");
  list.innerHTML = "";
  for (const word of recentWords) {
    const div = document.createElement("div");
    div.className = "word-entry";
    const bonus = word.length * word.length;
    div.textContent = '"' + word + '" (+' + bonus + ' bananas)';
    list.appendChild(div);
  }

  let bestWord = "";
  let bestCount = 0;
  for (const [word, count] of Object.entries(wordCounts)) {
    if (count > bestCount) {
      bestCount = count;
      bestWord = word;
    }
  }
  getEl("most-common-word").textContent = bestWord
    ? '"' + bestWord + '" (x' + bestCount + ')'
    : "None yet";

  getEl("unique-words-count").textContent = Object.keys(wordCounts).length.toString();
}

function renderAll(): void {
  renderStats();
  renderMonkeyTickers();
  renderUpgrades();
  renderWordDiscovery();
}

// --------------- Purchases ---------------

function purchaseGlobalUpgrade(id: string): void {
  const level = globalUpgrades[id] || 0;
  const cost = getUpgradeCost(GLOBAL_UPGRADES, id, level);
  if (bananas < cost) return;

  bananas -= cost;
  globalUpgrades[id] = level + 1;

  if (id === "monkey") {
    const newId = monkeys.length > 0 ? Math.max(...monkeys.map(m => m.id)) + 1 : 1;
    const nameIndex = (newId - 1) % MONKEY_NAMES.length;
    monkeys.push({
      id: newId,
      name: MONKEY_NAMES[nameIndex],
      buffer: "",
      displayChars: "",
      tickerHistory: [],
      wordsFound: 0,
      speedLevel: 0,
      bonusLevel: 0,
    });
    monkeyCharAccumulators.push(0);
  }

  renderAll();
}

function purchaseMonkeyUpgrade(monkeyId: number, upgradeId: string): void {
  const monkey = monkeys.find(m => m.id === monkeyId);
  if (!monkey) return;

  const level = upgradeId === "speed" ? monkey.speedLevel : monkey.bonusLevel;
  const cost = getUpgradeCost(MONKEY_UPGRADE_DEFS, upgradeId, level);
  if (bananas < cost) return;

  bananas -= cost;
  if (upgradeId === "speed") monkey.speedLevel++;
  else monkey.bonusLevel++;

  renderAll();
}

// --------------- Tab Management ---------------

function switchTab(tab: string): void {
  activeTab = tab;

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", (btn as HTMLElement).dataset.tab === tab);
  });

  document.querySelectorAll(".tab-pane").forEach(pane => {
    pane.classList.toggle("hidden", pane.id !== "tab-" + tab);
  });

  renderUpgrades();
}

// --------------- Save / Load ---------------

function serialize(): string {
  const save: SaveState = {
    bananas: bananas.toString(),
    totalLetters: totalLetters.toString(),
    globalUpgrades: { ...globalUpgrades },
    monkeys: monkeys.map(m => ({ ...m, tickerHistory: [...m.tickerHistory] })),
    recentWords: [...recentWords],
    wordCounts: { ...wordCounts },
    totalWordsFound,
    lastWordTime,
    comboCount,
    lastSaveTime: Date.now(),
  };
  return JSON.stringify(save);
}

function saveGame(): void {
  lastSaveTime = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, serialize());
  } catch {
    // Storage might be full; silently fail
  }
}

function loadGame(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const save = JSON.parse(raw) as Partial<SaveState>;

    bananas = BigInt(save.bananas || "0");
    totalLetters = BigInt(save.totalLetters || "0");

    globalUpgrades = { monkey: 0, typewriter: 0, training: 0, quill: 0, ...(save.globalUpgrades || {}) };

    if (Array.isArray(save.monkeys)) {
      monkeys = save.monkeys.map(m => ({
        id: m.id ?? 0,
        name: m.name ?? "Monkey",
        buffer: m.buffer ?? "",
        displayChars: m.displayChars ?? "",
        tickerHistory: Array.isArray(m.tickerHistory) ? m.tickerHistory.slice(0, MAX_TICKER_HISTORY) : [],
        wordsFound: m.wordsFound ?? 0,
        speedLevel: m.speedLevel ?? 0,
        bonusLevel: m.bonusLevel ?? 0,
      }));
    } else {
      monkeys = [];
    }
    monkeyCharAccumulators = monkeys.map(() => 0);

    recentWords = Array.isArray(save.recentWords) ? save.recentWords : [];
    wordCounts = (typeof save.wordCounts === "object" && save.wordCounts !== null) ? save.wordCounts : {};
    totalWordsFound = save.totalWordsFound ?? 0;
    lastWordTime = save.lastWordTime ?? 0;
    comboCount = save.comboCount ?? 0;
    lastSaveTime = save.lastSaveTime ?? Date.now();

    return true;
  } catch {
    return false;
  }
}

function addStartingMonkey(): void {
  const newId = 1;
  monkeys.push({
    id: newId,
    name: MONKEY_NAMES[0],
    buffer: "",
    displayChars: "",
    tickerHistory: [],
    wordsFound: 0,
    speedLevel: 0,
    bonusLevel: 0,
  });
  monkeyCharAccumulators.push(0);
  // Count the starting monkey in globalUpgrades so the purchase counter is consistent
  globalUpgrades.monkey = 1;
}

function resetGame(): void {
  if (confirm("Are you sure you want to reset all progress?")) {
    localStorage.removeItem(SAVE_KEY);
    bananas = 0n;
    totalLetters = 0n;
    globalUpgrades = { monkey: 0, typewriter: 0, training: 0, quill: 0 };
    monkeys = [];
    monkeyCharAccumulators = [];
    recentWords = [];
    wordCounts = {};
    totalWordsFound = 0;
    lastWordTime = 0;
    comboCount = 0;
    lastSaveTime = Date.now();

    // Clear monkey ticker DOM
    getEl("monkey-tickers-list").innerHTML = "";

    // Give the player their starting monkey back
    addStartingMonkey();

    renderAll();
  }
}

// --------------- Offline Progress ---------------

function handleOfflineProgress(): void {
  const now = Date.now();
  const elapsed = (now - lastSaveTime) / 1000;
  if (elapsed < 10) return;

  const lps = getTotalLPS();
  if (lps <= 0) return;

  const offlineChars = Math.floor(lps * elapsed);
  if (offlineChars <= 0) return;

  // Award bananas for characters
  bananas += BigInt(offlineChars);
  totalLetters += BigInt(offlineChars);

  // Estimate words found offline (~1 per 5000 chars heuristic)
  const estimatedWords = Math.floor(offlineChars / 5000);
  if (estimatedWords > 0) {
    const avgBonus = 16;
    bananas += BigInt(estimatedWords * avgBonus);
    totalWordsFound += estimatedWords;
  }

  const modal = getEl("offline-modal");
  getEl("offline-earnings").textContent = formatBigInt(BigInt(offlineChars));
  modal.classList.remove("hidden");
}

// --------------- Game Loop ---------------

let lastTickTime = Date.now();
let tickCount = 0;

function gameTick(): void {
  const now = Date.now();
  const dt = Math.min(now - lastTickTime, 1000); // cap delta to 1 second
  lastTickTime = now;
  tickCount++;

  const dtSec = dt / 1000;

  for (let i = 0; i < monkeys.length; i++) {
    const monkey = monkeys[i];
    const lps = getMonkeyLPS(monkey);
    const charsFloat = lps * dtSec + (monkeyCharAccumulators[i] || 0);
    const charsInt = Math.floor(charsFloat);
    monkeyCharAccumulators[i] = charsFloat - charsInt;

    if (charsInt > 0) {
      generateCharsForMonkey(monkey, charsInt);
    }
  }

  renderStats();
  renderMonkeyTickers();

  // Only re-render upgrades occasionally to save performance (every ~500ms = every 5 ticks)
  if (tickCount % 5 === 0) {
    renderUpgrades();
    renderWordDiscovery();
  }
}

// --------------- Visibility API for background ---------------

function handleVisibilityChange(): void {
  if (document.hidden) {
    saveGame();
  } else {
    // Coming back - calculate offline progress
    const now = Date.now();
    const elapsed = (now - lastSaveTime) / 1000;
    if (elapsed > 5) {
      const lps = getTotalLPS();
      if (lps > 0) {
        const offlineChars = Math.floor(lps * elapsed);
        bananas += BigInt(offlineChars);
        totalLetters += BigInt(offlineChars);

        const estimatedWords = Math.floor(offlineChars / 5000);
        if (estimatedWords > 0) {
          bananas += BigInt(estimatedWords * 16);
          totalWordsFound += estimatedWords;
        }
      }
    }
    lastTickTime = Date.now();
    lastSaveTime = Date.now();
    renderAll();
  }
}

// --------------- Initialization ---------------

function init(): void {
  const loaded = loadGame();

  // New game or save with no monkeys: give the player their first monkey automatically
  if (monkeys.length === 0) {
    addStartingMonkey();
  }

  if (loaded) {
    handleOfflineProgress();
  }

  renderAll();

  // Tab buttons
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = (btn as HTMLElement).dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // Modal close
  getEl("offline-close").addEventListener("click", () => {
    getEl("offline-modal").classList.add("hidden");
  });

  // Save / Reset
  getEl("save-btn").addEventListener("click", saveGame);
  getEl("reset-btn").addEventListener("click", resetGame);

  // Game loop
  setInterval(gameTick, TICK_INTERVAL_MS);

  // Auto-save
  setInterval(saveGame, AUTO_SAVE_INTERVAL_MS);

  // Save on page unload
  window.addEventListener("beforeunload", saveGame);

  // Visibility change for background handling
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

// Start the game when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
