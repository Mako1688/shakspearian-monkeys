# Shakespearian Monkeys 🐒🎭

An idle game based on the **infinite monkey theorem** — the idea that monkeys randomly typing on typewriters will eventually produce the complete works of Shakespeare.

## Game Concept

You manage a troupe of monkeys with typewriters. As they type random characters, they occasionally form real words, phrases, and — with enough monkeys and upgrades — complete passages from Shakespeare's works.

## Core Mechanics

| Mechanic | Description |
|----------|-------------|
| **Letters Per Second (LPS)** | The primary production rate. Each monkey contributes to LPS. |
| **Bananas (🍌)** | The main currency, earned as monkeys type. Used to buy upgrades. |
| **Manual Click** | Click the typewriter to generate letters manually. |
| **Idle Production** | Monkeys produce letters passively, even between sessions. |

## Upgrades & Progression

| Upgrade | Effect | Scaling |
|---------|--------|---------|
| **Hire Monkey** | +1 LPS base production | Cost increases 15% per purchase |
| **Better Typewriter** | +5 LPS per typewriter | Cost increases 25% per purchase |
| **Monkey Training** | 2× multiplier to all LPS | Cost increases 50% per purchase |
| **Shakespeare's Quill** | 10× multiplier boost | Cost increases 75% per purchase |

## Shakespeare Progress

As you accumulate letters, you progressively "type" through Shakespeare quotes. The game displays a live typewriter output that reveals famous quotes character by character as your monkeys produce letters.

## Technology Stack

- **HTML5** — Game UI structure
- **CSS3** — Responsive design for web and mobile
- **TypeScript** — Game logic and state management

## How to Build & Run

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Open index.html in a browser (uses compiled JS from dist/)
# Or use any static file server:
npx serve .
```

## Design Questions Addressed

1. **What is the core loop?** → Click to type letters → earn bananas → buy monkeys/upgrades → produce more letters passively
2. **How does idle/offline work?** → On return, elapsed time is calculated and offline earnings are awarded
3. **What is the theme?** → Monkeys on typewriters reproducing Shakespeare (infinite monkey theorem)
4. **How does it work on mobile?** → Responsive CSS with touch-friendly tap targets and viewport scaling
5. **What is the progression?** → Unlock Shakespeare quotes, buy increasingly powerful upgrades, watch the typewriter output grow
6. **What is the monetization model?** → None (free to play, no ads)
7. **How is state saved?** → LocalStorage auto-save every 30 seconds + on page unload
8. **What are the win conditions?** → Complete all Shakespeare quotes in the quote pool
