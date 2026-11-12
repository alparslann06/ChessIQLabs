# ♞ ChessIQLabs

A complete, responsive chess **analysis, puzzles & improvement** website — built with **plain HTML, CSS and vanilla JavaScript**. No frameworks, no build step, no dependencies.

![stack](https://img.shields.io/badge/stack-HTML%20%2B%20CSS%20%2B%20JS-e4f222) ![license](https://img.shields.io/badge/purpose-demo%20project-8a8f98)

---

## 🚀 Run it locally

**Option 1 — simplest:** double-click `index.html`. Everything works in the browser.

**Option 2 — local server (recommended, avoids any file:// quirks):**

```bash
# from this folder
python -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`.

> Fonts (Inter + JetBrains Mono) load from Google Fonts; offline you'll get system-font fallbacks and everything still works.

---

## 📄 Pages

| File | What it does |
|---|---|
| `index.html` | Landing page — hero with live chessboard, features, how-it-works, eval-graph showcase, stats, testimonials, FAQ, CTA |
| `analysis.html` | Interactive **game review**: an annotated walkthrough of the famous *Opera Game* (Morphy 1858) — 8 key positions, move grades, eval readout, keyboard navigation (← →) |
| `puzzles.html` | Interactive **tactics trainer** — click piece → click target. 3 scripted puzzles (back-rank mate, royal fork, queen-sac mate in 2), hints, streak saved in `localStorage` |
| `training.html` | Improvement method page — roadmap, daily 20-minute plan, mistake pattern library |
| `pricing.html` | Free / Pro / Coach tiers + comparison table + FAQ |
| `about.html` | Mission, principles, stats, demo contact form (toast, no backend) |

## 📁 Structure

```
chessiqlabs/
├── index.html
├── analysis.html
├── puzzles.html
├── training.html
├── pricing.html
├── about.html
├── css/
│   └── style.css        # full design system (tokens → components → responsive)
└── js/
    ├── chess.js         # FEN parser + board renderer + click/move logic
    ├── main.js          # nav, mobile menu, scroll reveals, FAQ, counters, toasts
    ├── analysis.js      # annotated Opera Game walkthrough
    └── puzzles.js       # tactics trainer (scripted solution trees)
```

## 🎨 Design system

Dark **"midnight precision"** aesthetic (inspired by Linear-style design):

- Canvas `#08090a` → surfaces `#0f1011` / `#161718`, hairline `0.5px` borders doing the separation (no glow/shadow stacking)
- Paper-white headings at tight tracking (`-0.022em`), weights capped at 510/590 (no bold)
- **One** electric acid-lime accent `#e4f222` used only for the primary action per view
- Radii vocabulary: 12px cards · 6px buttons/inputs · 9999px pills
- 96px section rhythm, 1200px max-width container
- Smooth scroll-reveal animations (IntersectionObserver), floating hero chips, animated counters — all with `prefers-reduced-motion` fallbacks

## ♟ Chess features (all vanilla JS)

- `js/chess.js` renders any FEN into an 8×8 grid (Unicode pieces, coordinates, selection/target/highlight states)
- Puzzle trainer validates moves against scripted solution trees, auto-plays opponent replies, shakes on wrong answers
- Analysis page steps through key FEN snapshots with grades (Brilliant → Blunder) and eval readout

## 📱 Responsive

Breakpoints at **1024px / 900px / 640px**: multi-column grids collapse, nav switches to a hamburger menu, boards scale fluidly (CSS container queries), floating chips hide on small screens.

---

*Demo project — all content, stats, and testimonials are placeholders. Not affiliated with Chess.com, Lichess, or Stockfish.*
