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
const MAX_TICKER_HISTORY = 12;
const MAX_DISPLAY_CHARS = 60;
const MAX_RECENT_WORDS = 10;

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

const GLOBAL_UPGRADES: Record<string, UpgradeDef> = {
  monkey:     { name: "Hire Monkey",        desc: "+1 new monkey typist",           baseCost: 10n,   costMult: 1.15 },
  typewriter: { name: "Better Typewriters",  desc: "+1 LPS per monkey",             baseCost: 100n,  costMult: 1.30 },
  training:   { name: "Monkey Training",     desc: "2x LPS multiplier (all)",       baseCost: 500n,  costMult: 1.50 },
  quill:      { name: "Golden Quill",        desc: "10x LPS multiplier (all)",      baseCost: 5000n, costMult: 1.75 },
};

const CLICK_UPGRADES: Record<string, UpgradeDef> = {
  power:      { name: "Quick Fingers",   desc: "+1 chars per click",    baseCost: 25n,  costMult: 1.20 },
  multiplier: { name: "Double Tap",      desc: "2x click power",        baseCost: 200n, costMult: 1.50 },
};

const MONKEY_UPGRADE_DEFS: Record<string, UpgradeDef> = {
  speed: { name: "Speed Boost",  desc: "+1 LPS for this monkey", baseCost: 20n,  costMult: 1.15 },
  bonus: { name: "Word Mastery", desc: "1.5x word bonus",        baseCost: 100n, costMult: 1.30 },
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
  clickUpgrades: Record<string, number>;
  monkeys: MonkeyData[];
  playerBuffer: string;
  playerDisplayChars: string;
  playerTickerHistory: string[];
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
let clickUpgrades: Record<string, number> = { power: 0, multiplier: 0 };

let monkeys: MonkeyData[] = [];

let playerBuffer = "";
let playerDisplayChars = "";
let playerTickerHistory: string[] = [];

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
  let mult = 1;
  if (globalUpgrades.training > 0) mult *= Math.pow(2, globalUpgrades.training);
  if (globalUpgrades.quill > 0) mult *= Math.pow(10, globalUpgrades.quill);
  return base * mult;
}

function getTotalLPS(): number {
  let total = 0;
  for (const m of monkeys) {
    total += getMonkeyLPS(m);
  }
  return total;
}

function getClickPower(): number {
  const base = 1 + clickUpgrades.power;
  const mult = Math.pow(2, clickUpgrades.multiplier);
  return Math.floor(base * mult);
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
    if (WORD_SET.has(candidate)) {
      const bonus = getWordBonus(candidate, monkey);
      return { word: candidate, bonus };
    }
  }
  return null;
}

// --------------- Character Generation ---------------

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

function generateCharsForPlayer(amount: number): void {
  const chars = Math.floor(amount);
  if (chars <= 0) return;

  bananas += BigInt(chars);
  totalLetters += BigInt(chars);

  for (let i = 0; i < chars; i++) {
    const char = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    playerBuffer += char;
    playerDisplayChars += char;

    const result = checkForWordInBuffer(playerBuffer);
    if (result) {
      bananas += result.bonus;
      totalWordsFound++;
      wordCounts[result.word] = (wordCounts[result.word] || 0) + 1;
      recentWords.unshift(result.word);
      if (recentWords.length > MAX_RECENT_WORDS) recentWords.pop();

      playerTickerHistory.unshift(result.word + " (+" + result.bonus.toString() + ")");
      if (playerTickerHistory.length > MAX_TICKER_HISTORY) playerTickerHistory.pop();

      playerBuffer = "";
    }

    if (playerBuffer.length > MAX_WORD_LENGTH) {
      playerBuffer = playerBuffer.slice(-MAX_WORD_LENGTH);
    }
  }

  if (playerDisplayChars.length > MAX_DISPLAY_CHARS) {
    playerDisplayChars = playerDisplayChars.slice(-MAX_DISPLAY_CHARS);
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

function renderPlayerTicker(): void {
  const output = getEl("player-output");
  output.textContent = playerDisplayChars || "(click to start typing)";

  const wordsList = getEl("player-words");
  wordsList.innerHTML = "";
  for (const entry of playerTickerHistory) {
    const div = document.createElement("div");
    div.className = "ticker-word-entry";
    div.textContent = entry;
    wordsList.appendChild(div);
  }
}

function renderMonkeyTickers(): void {
  const container = getEl("monkey-tickers-list");

  if (monkeys.length === 0) {
    container.innerHTML = '<p class="no-monkeys">Hire your first monkey to see them type!</p>';
    return;
  }

  // Remove placeholder text
  const placeholder = container.querySelector(".no-monkeys");
  if (placeholder) placeholder.remove();

  // Create or update monkey ticker elements
  for (const monkey of monkeys) {
    let el = document.getElementById("monkey-ticker-" + monkey.id);
    if (!el) {
      el = document.createElement("div");
      el.id = "monkey-ticker-" + monkey.id;
      el.className = "monkey-ticker";
      container.appendChild(el);
    }

    const lps = getMonkeyLPS(monkey);
    el.innerHTML =
      '<div class="monkey-ticker-header">' +
        '<span class="monkey-name">' + escapeHtml(monkey.name) + '</span>' +
        '<span class="monkey-lps">' + formatNumber(lps) + ' LPS</span>' +
      '</div>' +
      '<div class="monkey-chars">' + escapeHtml(monkey.displayChars || "...") + '</div>' +
      '<div class="monkey-words-list">' +
        monkey.tickerHistory.map(w => '<div class="ticker-word-entry">' + escapeHtml(w) + '</div>').join('') +
      '</div>';
  }

  // Remove tickers for monkeys that no longer exist
  const existingTickers = container.querySelectorAll(".monkey-ticker");
  existingTickers.forEach(ticker => {
    const id = parseInt(ticker.id.replace("monkey-ticker-", ""), 10);
    if (!monkeys.find(m => m.id === id)) {
      ticker.remove();
    }
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderUpgrades(): void {
  renderGlobalUpgrades();
  renderClickUpgrades();
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

function renderClickUpgrades(): void {
  const container = getEl("tab-click");
  container.innerHTML = "";

  // Show current click power
  const info = document.createElement("div");
  info.className = "click-power-info";
  info.textContent = "Current click power: " + getClickPower() + " chars/click";
  container.appendChild(info);

  for (const [id, def] of Object.entries(CLICK_UPGRADES)) {
    const level = clickUpgrades[id] || 0;
    const cost = getUpgradeCost(CLICK_UPGRADES, id, level);
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
    btn.addEventListener("click", () => purchaseClickUpgrade(id));
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
  renderPlayerTicker();
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

function purchaseClickUpgrade(id: string): void {
  const level = clickUpgrades[id] || 0;
  const cost = getUpgradeCost(CLICK_UPGRADES, id, level);
  if (bananas < cost) return;

  bananas -= cost;
  clickUpgrades[id] = level + 1;

  // Update click button text
  const sub = document.querySelector("#click-btn .btn-sub");
  if (sub) sub.textContent = "+" + getClickPower() + " letters per click";

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

// --------------- Click Handler ---------------

function handleClick(): void {
  generateCharsForPlayer(getClickPower());
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
    clickUpgrades: { ...clickUpgrades },
    monkeys: monkeys.map(m => ({ ...m, tickerHistory: [...m.tickerHistory] })),
    playerBuffer,
    playerDisplayChars,
    playerTickerHistory: [...playerTickerHistory],
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
    clickUpgrades = { power: 0, multiplier: 0, ...(save.clickUpgrades || {}) };

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

    playerBuffer = save.playerBuffer ?? "";
    playerDisplayChars = save.playerDisplayChars ?? "";
    playerTickerHistory = Array.isArray(save.playerTickerHistory) ? save.playerTickerHistory.slice(0, MAX_TICKER_HISTORY) : [];

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

function resetGame(): void {
  if (confirm("Are you sure you want to reset all progress?")) {
    localStorage.removeItem(SAVE_KEY);
    bananas = 0n;
    totalLetters = 0n;
    globalUpgrades = { monkey: 0, typewriter: 0, training: 0, quill: 0 };
    clickUpgrades = { power: 0, multiplier: 0 };
    monkeys = [];
    monkeyCharAccumulators = [];
    playerBuffer = "";
    playerDisplayChars = "";
    playerTickerHistory = [];
    recentWords = [];
    wordCounts = {};
    totalWordsFound = 0;
    lastWordTime = 0;
    comboCount = 0;
    lastSaveTime = Date.now();

    // Clear monkey ticker DOM
    getEl("monkey-tickers-list").innerHTML = "";

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

  // Estimate words found offline based on average word rate
  // Average word length ~4.5, probability of random word ≈ words_in_dict / 26^avg_len
  // Simplified: estimate ~1 word per 5000 chars as a rough heuristic
  const estimatedWords = Math.floor(offlineChars / 5000);
  if (estimatedWords > 0) {
    const avgBonus = 16; // average ~4-letter word bonus
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
  renderPlayerTicker();
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
  if (loaded) {
    handleOfflineProgress();
  }

  renderAll();

  // Click button
  getEl("click-btn").addEventListener("click", handleClick);
  // Update click button text
  const sub = document.querySelector("#click-btn .btn-sub");
  if (sub) sub.textContent = "+" + getClickPower() + " letters per click";

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
