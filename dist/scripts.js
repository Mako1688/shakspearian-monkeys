/* ============================================
   Shakespearian Monkeys – Game Logic
   ============================================ */
import { WORD_SET } from './words.js';
// --------------- Constants & Types ---------------
const SAVE_KEY = "shakespearian-monkeys-save";
const AUTO_SAVE_INTERVAL_MS = 30000;
const TICK_INTERVAL_MS = 100; // 10 ticks per second
const MAX_WORD_LENGTH = 10;
const MIN_WORD_LENGTH = 3;
const COMBO_WINDOW_MS = 3000; // 3 seconds for combo
const MAX_DISPLAY_CHARS = 30; // chars to keep in vertical receipt
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
// Costs are much higher and scaling is steeper to prevent runaway progression.
// Hire Monkey: 50 base, 1.55x; Better Typewriters: 750 base, 1.75x
// Monkey Training: 8000 base, 2.50x; Golden Quill: 150000 base, 4.00x
const GLOBAL_UPGRADES = {
    monkey: { name: "Hire Monkey", desc: "+1 new monkey typist", baseCost: 50n, costMult: 1.55 },
    typewriter: { name: "Better Typewriters", desc: "+1 LPS per monkey", baseCost: 750n, costMult: 1.75 },
    training: { name: "Monkey Training", desc: "1.5x LPS multiplier (all)", baseCost: 8000n, costMult: 2.50 },
    quill: { name: "Golden Quill", desc: "3x LPS multiplier (all)", baseCost: 150000n, costMult: 4.00 },
};
const MONKEY_UPGRADE_DEFS = {
    speed: { name: "Speed Boost", desc: "+1 LPS for this monkey", baseCost: 120n, costMult: 1.55 },
    bonus: { name: "Word Mastery", desc: "1.5x word bonus", baseCost: 600n, costMult: 1.80 },
};
/** Bonus multiplier tiers for word length — longer words get progressively larger rewards */
const WORD_LENGTH_TIERS = {
    3: { label: "Common", multiplier: 1.0 },
    4: { label: "Adept", multiplier: 1.2 },
    5: { label: "Skilled", multiplier: 1.5 },
    6: { label: "Expert", multiplier: 2.0 },
    7: { label: "Master", multiplier: 3.0 },
    8: { label: "Legendary", multiplier: 5.0 },
    9: { label: "Mythical", multiplier: 8.0 },
    10: { label: "Shakespearian", multiplier: 12.0 },
};
const WORD_MILESTONES = [
    { threshold: 10, reward: 500n, label: "Novice Lexicon" },
    { threshold: 25, reward: 2000n, label: "Budding Vocabulary" },
    { threshold: 50, reward: 10000n, label: "Wordsmith" },
    { threshold: 100, reward: 50000n, label: "Linguist" },
    { threshold: 200, reward: 250000n, label: "Scholar" },
    { threshold: 500, reward: 1000000n, label: "Bard" },
    { threshold: 1000, reward: 10000000n, label: "Shakespeare" },
];
const SENTENCE_TEMPLATES = [
    ["the", "*", "is", "*"],
    ["a", "*", "and", "a", "*"],
    ["*", "the", "*"],
    ["my", "*", "has", "*"],
    ["the", "*", "of", "*"],
];
const MIN_WORDS_FOR_SENTENCE = 5;
const SENTENCE_CHECK_INTERVAL = 50; // check every 50 ticks
const SENTENCE_BONUS_BASE = 500n;
// --------------- Runtime State ---------------
let bananas = 0n;
let totalLetters = 0n;
let globalUpgrades = { monkey: 0, typewriter: 0, training: 0, quill: 0 };
let monkeys = [];
let recentWords = [];
let wordCounts = {};
let totalWordsFound = 0;
let lastWordTime = 0;
let comboCount = 0;
let lastSaveTime = Date.now();
let activeTab = "global";
// Accumulator for fractional chars per monkey per tick
let monkeyCharAccumulators = [];
// Stable DOM-diffing for ticker chars
const lastRenderedCharCount = new Map();
// Dirty flag for word discovery rendering
let wordDiscoveryDirty = true;
// Milestone tracking
let claimedMilestones = new Set();
// Sentence generation state
let sentences = [];
const MAX_SENTENCES = 5;
// --------------- Derived Values ---------------
function getUpgradeCost(defs, id, level) {
    const def = defs[id];
    return BigInt(Math.floor(Number(def.baseCost) * Math.pow(def.costMult, level)));
}
function getMonkeyLPS(monkey) {
    const base = 1 + globalUpgrades.typewriter + monkey.speedLevel;
    // Training: 1.5x per level (was 2x), Quill: 3x per level (was 10x)
    let mult = 1;
    if (globalUpgrades.training > 0)
        mult *= Math.pow(1.5, globalUpgrades.training);
    if (globalUpgrades.quill > 0)
        mult *= Math.pow(3, globalUpgrades.quill);
    // Hard cap to prevent browser hangs from extreme upgrade stacking
    return Math.min(base * mult, MAX_LPS_PER_MONKEY);
}
function getTotalLPS() {
    let total = 0;
    for (const m of monkeys) {
        total += getMonkeyLPS(m);
    }
    return total;
}
function getWordBonus(word, monkey) {
    let bonus = BigInt(word.length * word.length);
    // Word length tier bonus (words outside 3-10 range default to Common tier)
    const tier = WORD_LENGTH_TIERS[word.length] ?? WORD_LENGTH_TIERS[3];
    bonus = BigInt(Math.floor(Number(bonus) * tier.multiplier));
    // Per-monkey bonus
    if (monkey && monkey.bonusLevel > 0) {
        const mult = Math.pow(1.5, monkey.bonusLevel);
        bonus = BigInt(Math.floor(Number(bonus) * mult));
    }
    // Combo bonus
    const now = Date.now();
    if (now - lastWordTime < COMBO_WINDOW_MS && lastWordTime > 0) {
        comboCount++;
    }
    else {
        comboCount = 1;
    }
    lastWordTime = now;
    if (comboCount > 1) {
        const comboMult = 1 + (comboCount - 1) * 0.1;
        bonus = BigInt(Math.floor(Number(bonus) * comboMult));
    }
    return bonus;
}
function checkWordMilestones() {
    const uniqueCount = Object.keys(wordCounts).length;
    for (const milestone of WORD_MILESTONES) {
        if (uniqueCount >= milestone.threshold && !claimedMilestones.has(milestone.threshold)) {
            claimedMilestones.add(milestone.threshold);
            bananas += milestone.reward;
        }
    }
}
// --------------- Word Detection ---------------
function checkForWordInBuffer(buffer, monkey) {
    for (let len = Math.min(buffer.length, MAX_WORD_LENGTH); len >= MIN_WORD_LENGTH; len--) {
        const candidate = buffer.slice(-len);
        if (WORD_SET.has(candidate) && !BANNED_WORDS.has(candidate)) {
            const bonus = getWordBonus(candidate, monkey);
            return { word: candidate, bonus };
        }
    }
    return null;
}
const pendingWordFloats = [];
function generateCharsForMonkey(monkey, amount) {
    const chars = Math.floor(amount);
    if (chars <= 0)
        return;
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
            if (recentWords.length > MAX_RECENT_WORDS)
                recentWords.pop();
            checkWordMilestones();
            wordDiscoveryDirty = true;
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
function formatBigInt(n) {
    if (n < 0n)
        return "-" + formatBigInt(-n);
    const s = n.toString();
    const len = s.length;
    if (len <= 3)
        return s;
    const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
    const tierIndex = Math.min(Math.floor((len - 1) / 3), suffixes.length - 1);
    const divisorDigits = tierIndex * 3;
    const sigPart = s.substring(0, len - divisorDigits);
    const fracPart = s.substring(len - divisorDigits, len - divisorDigits + 2).padEnd(2, "0");
    if (sigPart.length === 1)
        return sigPart + "." + fracPart + suffixes[tierIndex];
    if (sigPart.length === 2)
        return sigPart + "." + fracPart.charAt(0) + suffixes[tierIndex];
    return sigPart + suffixes[tierIndex];
}
function formatNumber(n) {
    return formatBigInt(BigInt(Math.floor(n)));
}
// --------------- DOM Helpers ---------------
function getEl(id) {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`Element #${id} not found`);
    return el;
}
// --------------- Rendering ---------------
function renderStats() {
    getEl("bananas").textContent = formatBigInt(bananas);
    getEl("lps").textContent = formatNumber(getTotalLPS());
    getEl("total-letters").textContent = formatBigInt(totalLetters);
    getEl("total-words").textContent = totalWordsFound.toString();
    const comboEl = getEl("combo");
    if (comboCount > 1 && Date.now() - lastWordTime < COMBO_WINDOW_MS) {
        comboEl.textContent = comboCount + "x";
        comboEl.classList.add("combo-active");
    }
    else {
        comboEl.textContent = "--";
        comboEl.classList.remove("combo-active");
    }
}
// --------------- Word Float Animations ---------------
function flushWordFloats() {
    for (const evt of pendingWordFloats) {
        const headerEl = document.getElementById("monkey-header-" + evt.monkeyId);
        if (!headerEl)
            continue;
        const floater = document.createElement("span");
        floater.className = "word-floater";
        floater.textContent = evt.word + " +" + evt.bonus.toString();
        headerEl.appendChild(floater);
        floater.addEventListener("animationend", () => floater.remove(), { once: true });
    }
    pendingWordFloats.length = 0;
}
function renderMonkeyTickers() {
    const container = getEl("monkey-tickers-list");
    // Remove placeholder text if present
    const placeholder = container.querySelector(".no-monkeys");
    if (placeholder && monkeys.length > 0)
        placeholder.remove();
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
        const lpsSpan = el.querySelector(".monkey-lps");
        if (lpsSpan)
            lpsSpan.textContent = formatNumber(getMonkeyLPS(monkey)) + " LPS";
        // Update monkey name (may change via individual upgrades panel)
        const nameSpan = el.querySelector(".monkey-name");
        if (nameSpan)
            nameSpan.textContent = monkey.name;
        // Render vertical receipt-paper chars: newest char at top, oldest at bottom
        const charsDiv = document.getElementById("monkey-chars-" + monkey.id);
        if (charsDiv) {
            const chars = monkey.displayChars;
            const prevLen = lastRenderedCharCount.get(monkey.id) ?? 0;
            const newLen = chars.length;
            // Only update if chars changed
            if (newLen !== prevLen) {
                // Add new chars at the top (newest first)
                const newChars = newLen > prevLen ? chars.slice(prevLen) : '';
                for (let i = newChars.length - 1; i >= 0; i--) {
                    const span = document.createElement('span');
                    span.className = 'ticker-char';
                    span.textContent = newChars[i];
                    charsDiv.insertBefore(span, charsDiv.firstChild);
                }
                // Remove excess children from bottom (oldest) to keep at MAX_DISPLAY_CHARS
                while (charsDiv.children.length > MAX_DISPLAY_CHARS) {
                    charsDiv.removeChild(charsDiv.lastChild);
                }
                lastRenderedCharCount.set(monkey.id, newLen);
            }
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
function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function renderUpgrades() {
    renderGlobalUpgrades();
    renderIndividualUpgrades();
}
function renderGlobalUpgrades() {
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
function renderIndividualUpgrades() {
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
function renderWordDiscovery() {
    if (!wordDiscoveryDirty)
        return;
    wordDiscoveryDirty = false;
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
    renderMilestones();
    renderSentences();
}
function renderMilestones() {
    const container = document.getElementById("word-milestones-list");
    if (!container)
        return;
    container.innerHTML = "";
    const uniqueCount = Object.keys(wordCounts).length;
    for (const ms of WORD_MILESTONES) {
        const div = document.createElement("div");
        div.className = "word-entry";
        const claimed = claimedMilestones.has(ms.threshold);
        const progress = Math.min(uniqueCount, ms.threshold);
        div.textContent = (claimed ? "[x] " : "[ ] ") + ms.label + " (" + progress + "/" + ms.threshold + ") — " + formatBigInt(ms.reward) + " bananas";
        container.appendChild(div);
    }
}
function renderSentences() {
    const container = document.getElementById("sentence-list");
    if (!container)
        return;
    container.innerHTML = "";
    for (const s of sentences) {
        const div = document.createElement("div");
        div.className = "word-entry";
        div.textContent = s;
        container.appendChild(div);
    }
}
function renderAll() {
    renderStats();
    renderMonkeyTickers();
    renderUpgrades();
    renderWordDiscovery();
}
// --------------- Purchases ---------------
function purchaseGlobalUpgrade(id) {
    const level = globalUpgrades[id] || 0;
    const cost = getUpgradeCost(GLOBAL_UPGRADES, id, level);
    if (bananas < cost)
        return;
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
            wordsFound: 0,
            speedLevel: 0,
            bonusLevel: 0,
        });
        monkeyCharAccumulators.push(0);
    }
    renderAll();
}
function purchaseMonkeyUpgrade(monkeyId, upgradeId) {
    const monkey = monkeys.find(m => m.id === monkeyId);
    if (!monkey)
        return;
    const level = upgradeId === "speed" ? monkey.speedLevel : monkey.bonusLevel;
    const cost = getUpgradeCost(MONKEY_UPGRADE_DEFS, upgradeId, level);
    if (bananas < cost)
        return;
    bananas -= cost;
    if (upgradeId === "speed")
        monkey.speedLevel++;
    else
        monkey.bonusLevel++;
    renderAll();
}
// --------------- Tab Management ---------------
function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".tab-pane").forEach(pane => {
        pane.classList.toggle("hidden", pane.id !== "tab-" + tab);
    });
    renderUpgrades();
}
// --------------- Save / Load ---------------
function serialize() {
    const save = {
        bananas: bananas.toString(),
        totalLetters: totalLetters.toString(),
        globalUpgrades: { ...globalUpgrades },
        monkeys: monkeys.map(m => ({ ...m })),
        recentWords: [...recentWords],
        wordCounts: { ...wordCounts },
        totalWordsFound,
        lastWordTime,
        comboCount,
        lastSaveTime: Date.now(),
        claimedMilestones: [...claimedMilestones],
        sentences: [...sentences],
    };
    return JSON.stringify(save);
}
function saveGame() {
    lastSaveTime = Date.now();
    try {
        localStorage.setItem(SAVE_KEY, serialize());
    }
    catch {
        // Storage might be full; silently fail
    }
}
function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw)
            return false;
        const save = JSON.parse(raw);
        bananas = BigInt(save.bananas || "0");
        totalLetters = BigInt(save.totalLetters || "0");
        globalUpgrades = { monkey: 0, typewriter: 0, training: 0, quill: 0, ...(save.globalUpgrades || {}) };
        if (Array.isArray(save.monkeys)) {
            monkeys = save.monkeys.map(m => ({
                id: m.id ?? 0,
                name: m.name ?? "Monkey",
                buffer: m.buffer ?? "",
                displayChars: m.displayChars ?? "",
                wordsFound: m.wordsFound ?? 0,
                speedLevel: m.speedLevel ?? 0,
                bonusLevel: m.bonusLevel ?? 0,
            }));
        }
        else {
            monkeys = [];
        }
        monkeyCharAccumulators = monkeys.map(() => 0);
        recentWords = Array.isArray(save.recentWords) ? save.recentWords : [];
        wordCounts = (typeof save.wordCounts === "object" && save.wordCounts !== null) ? save.wordCounts : {};
        totalWordsFound = save.totalWordsFound ?? 0;
        lastWordTime = save.lastWordTime ?? 0;
        comboCount = save.comboCount ?? 0;
        lastSaveTime = save.lastSaveTime ?? Date.now();
        claimedMilestones = new Set(Array.isArray(save.claimedMilestones) ? save.claimedMilestones : []);
        sentences = Array.isArray(save.sentences) ? save.sentences : [];
        wordDiscoveryDirty = true;
        return true;
    }
    catch {
        return false;
    }
}
function addStartingMonkey() {
    const newId = 1;
    monkeys.push({
        id: newId,
        name: MONKEY_NAMES[0],
        buffer: "",
        displayChars: "",
        wordsFound: 0,
        speedLevel: 0,
        bonusLevel: 0,
    });
    monkeyCharAccumulators.push(0);
    // Count the starting monkey in globalUpgrades so the purchase counter is consistent
    globalUpgrades.monkey = 1;
}
function resetGame() {
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
        lastRenderedCharCount.clear();
        wordDiscoveryDirty = true;
        claimedMilestones = new Set();
        sentences = [];
        // Clear monkey ticker DOM
        getEl("monkey-tickers-list").innerHTML = "";
        // Give the player their starting monkey back
        addStartingMonkey();
        renderAll();
    }
}
// --------------- Offline Progress ---------------
function handleOfflineProgress() {
    const now = Date.now();
    const elapsed = (now - lastSaveTime) / 1000;
    if (elapsed < 10)
        return;
    const lps = getTotalLPS();
    if (lps <= 0)
        return;
    const offlineChars = Math.floor(lps * elapsed);
    if (offlineChars <= 0)
        return;
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
function tryGenerateSentence() {
    const discoveredWords = Object.keys(wordCounts);
    if (discoveredWords.length < MIN_WORDS_FOR_SENTENCE)
        return;
    const template = SENTENCE_TEMPLATES[Math.floor(Math.random() * SENTENCE_TEMPLATES.length)];
    const fillerWords = discoveredWords.filter(w => w.length >= 3);
    if (fillerWords.length < 2)
        return;
    const parts = [];
    for (const token of template) {
        if (token === "*") {
            parts.push(fillerWords[Math.floor(Math.random() * fillerWords.length)]);
        }
        else {
            parts.push(token);
        }
    }
    const sentence = parts.join(" ");
    // All "*" tokens have been replaced, so parts.length is the total word count
    const wordCount = parts.length;
    const bonus = BigInt(wordCount) * SENTENCE_BONUS_BASE;
    bananas += bonus;
    sentences.unshift('"' + sentence + '" (+' + formatBigInt(bonus) + ')');
    if (sentences.length > MAX_SENTENCES)
        sentences.pop();
}
let lastTickTime = Date.now();
let tickCount = 0;
function gameTick() {
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
    if (tickCount % SENTENCE_CHECK_INTERVAL === 0) {
        tryGenerateSentence();
    }
    // Only re-render upgrades occasionally to save performance (every ~500ms = every 5 ticks)
    if (tickCount % 5 === 0) {
        renderUpgrades();
        renderWordDiscovery();
    }
}
// --------------- Visibility API for background ---------------
function handleVisibilityChange() {
    if (document.hidden) {
        saveGame();
    }
    else {
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
function init() {
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
            const tab = btn.dataset.tab;
            if (tab)
                switchTab(tab);
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
}
else {
    init();
}
//# sourceMappingURL=scripts.js.map