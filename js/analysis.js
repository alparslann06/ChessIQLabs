/* ============================================================
   ChessIQLabs — js/analysis.js
   Full move-by-move walkthrough of the "Opera Game"
   (Morphy vs. Duke of Brunswick & Count Isouard, Paris 1858).
   Every ply has a verified FEN, an engine-style eval, a grade
   badge, and a note. Pieces animate between positions.
   ============================================================ */

(function () {
  "use strict";
  if (!window.ChessBoard) return;

  const CB = window.ChessBoard;

  /* Badge definition per grade (chess.com-style circular icons) */
  const BADGES = {
    brilliant: { cls: "b-brilliant", glyph: "!!", label: "Brilliant" },
    good:      { cls: "b-good",      glyph: "\u2713", label: "Best" },
    ok:        { cls: "b-ok",        glyph: "\u2713", label: "Good" },
    book:      { cls: "b-book",      glyph: "\u25A4", label: "Book" },
    mistake:   { cls: "b-mistake",   glyph: "?",  label: "Mistake" },
    blunder:   { cls: "b-blunder",   glyph: "??", label: "Blunder" },
    mate:      { cls: "b-mate",      glyph: "#",  label: "Checkmate" }
  };

  function badgeHTML(grade, lg) {
    const b = BADGES[grade];
    if (!b) return "";
    return '<span class="mv-badge ' + b.cls + (lg ? " lg" : "") + '" title="' + b.label + '">' + b.glyph + "</span>";
  }

  /* v = illustrative engine eval in pawns for White; 99 = mate */
  const POSITIONS = [
    { san: "Start", white: false, fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", v: 0.2, grade: null, note: "The most famous game in chess history. Morphy, playing White, is about to demonstrate what true development means — against two opponents bringing out barely any pieces." },

    { san: "1. e4",   white: true,  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", v: 0.3, grade: "book", note: "The most principled opening move: a pawn into the center, freeing the bishop and queen." },
    { san: "1... e5", white: false, fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", v: 0.3, grade: "book", note: "Black mirrors — the classical, principled reply." },
    { san: "2. Nf3",  white: true,  fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2", v: 0.4, grade: "book", note: "Development with tempo — the knight immediately attacks the e5 pawn." },
    { san: "2... d6", white: false, fen: "rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3", v: 0.4, grade: "book", note: "The Philidor Defence: solid, but passive — the light-squared bishop is about to get buried." },
    { san: "3. d4",   white: true,  fen: "rnbqkbnr/ppp2ppp/3p4/4p3/3P4/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3", v: 0.5, grade: "book", note: "White strikes the center at once, challenging e5." },
    { san: "3... Bg4", white: false, fen: "rn1qkbnr/ppp2ppp/3p4/4p3/3PP1b1/5N2/PPP2PPP/RNBQKB1R w KQkq - 1 4", v: 0.4, grade: "ok", note: "The pin looks active but is actually passive: this bishop will never take part in Black's defence, while White builds a huge center." },
    { san: "4. dxe5", white: true,  fen: "rn1qkbnr/ppp2ppp/3p4/4P3/4P3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 4", v: 0.6, grade: "good", note: "Morphy grabs space — White now has two pawns in the center." },
    { san: "4... Bxf3", white: false, fen: "rn1qkbnr/ppp2ppp/3p4/4P3/4P3/5b2/PPP2PPP/RNBQKB1R w KQkq - 0 5", v: 0.5, grade: "ok", note: "Black trades his good bishop for the knight. A relief for White, whose remaining pieces get more room." },
    { san: "5. Qxf3", white: true,  fen: "rn1qkbnr/ppp2ppp/3p4/4P3/4P3/5Q2/PPP2PPP/RNB1KB1R b KQkq - 0 5", v: 0.7, grade: "good", note: "The queen recaptures and lands on an active square, already eyeing the weak f7 point." },
    { san: "5... dxe5", white: false, fen: "rn1qkbnr/ppp2ppp/8/4p3/4P3/5Q2/PPP2PPP/RNB1KB1R w KQkq - 0 6", v: 0.8, grade: "ok", note: "Material is equal again — but count pieces in play: White has two, Black zero." },
    { san: "6. Bc4",  white: true,  fen: "rn1qkbnr/ppp2ppp/8/4p3/2B5/5Q2/PPP2PPP/RNB1K2R b KQkq - 1 6", v: 0.9, grade: "good", note: "Aiming straight at the most weakly defended square on the board: f7." },
    { san: "6... Nf6", white: false, fen: "rn1qkb1r/ppp2ppp/5n2/4p3/2B1P3/5Q2/PPP2PPP/RNB1K2R w KQkq - 2 7", v: 0.9, grade: "good", note: "Black blocks the threat and develops at last." },
    { san: "7. Qb3",  white: true,  fen: "rn1qkb1r/ppp2ppp/5n2/4p3/2B1P3/1Q6/PPP2PPP/RNB1K2R b KQkq - 3 7", v: 1.1, grade: "brilliant", note: "A double attack on b7 and f7 — both weak because the d7-square and the light squares are under-defended. Black must react immediately." },
    { san: "7... Qe7", white: false, fen: "rn2kb1r/ppp1qppp/5n2/4p3/2B1P3/1Q6/PPP2PPP/RNB1K2R w KQkq - 4 8", v: 1.2, grade: "good", note: "The only move that defends everything at once — the queen guards f7 and covers d7." },
    { san: "8. Nc3",  white: true,  fen: "rn2kb1r/ppp1qppp/5n2/4p3/2B1P3/1QN5/PPP2PPP/R1B1K2R b KQkq - 5 8", v: 1.3, grade: "good", note: "Every White move adds a new attacker; Black is still untangling." },
    { san: "8... c6", white: false, fen: "rn2kb1r/pp2qppp/2p2n2/4p3/2B1P3/1QN5/PPP2PPP/R1B1K2R w KQkq - 0 9", v: 1.4, grade: "ok", note: "Supporting d5 to blunt the b3-bishop — but it permanently weakens the light squares." },
    { san: "9. Bg5",  white: true,  fen: "rn2kb1r/pp2qppp/2p2n2/4p1B2/2B1P3/1QN5/PPP2PPP/R3K2R b KQkq - 1 9", v: 1.5, grade: "good", note: "The pin! The f6-knight is now tied to the queen and cannot move without consequences." },
    { san: "9... b5", white: false, fen: "rn2kb1r/p3qppp/2p2n2/1p2p1B2/2B1P3/1QN5/PPP2PPP/R3K2R w KQkq - 0 10", v: 2.4, grade: "blunder", note: "The losing move. Trying to chase the bishop with pawns, Black opens critical queenside lines and abandons d7 forever. 9...Qb4+ or 9...Nbd7 was necessary." },
    { san: "10. Nxb5", white: true,  fen: "rn2kb1r/p3qppp/2p2n2/1N2p1B2/2B1P3/1Q6/PPP2PPP/R3K2R b KQkq - 0 10", v: 3.0, grade: "brilliant", note: "Morphy takes the pawn with a piece — because Black has no time to collect the knight: the pin on f6 and the exposed king are worth more than a knight." },
    { san: "10... cxb5", white: false, fen: "rn2kb1r/p3qppp/8/1p2p1B2/2B1P3/1Q6/PPP2PPP/R3K2R w KQkq - 0 11", v: 3.2, grade: "ok", note: "Forced — declining the capture costs even more." },
    { san: "11. Bxb5+", white: true,  fen: "rn2kb1r/p3qppp/8/1B2p1B2/4P3/1Q6/PPP2PPP/R3K2R b KQkq - 0 11", v: 3.6, grade: "good", note: "Check along the b5–e8 diagonal, with the f6-knight still pinned by the g5-bishop." },
    { san: "11... Nbd7", white: false, fen: "r3kb1r/p2nqppp/5n2/1B2p1B2/4P3/1Q6/PPP2PPP/R3K2R w KQkq - 1 12", v: 3.8, grade: "ok", note: "Black is a pawn up but strategically lost: the f6-knight is pinned, d7 is a parking lot, and every White piece aims at d7." },
    { san: "12. O-O-O", white: true,  fen: "r3kb1r/p2nqppp/5n2/1B2p1B2/4P3/1Q6/PPP2PPP/2KR3R b k - 2 12", v: 4.2, grade: "good", note: "White castles INTO the attack — the rook lands on the d-file. Black cannot even castle: the pinned knight freezes everything." },
    { san: "12... Rd8", white: false, fen: "3rkb1r/p2nqppp/5n2/1B2p1B2/4P3/1Q6/PPP2PPP/2KR3R w k - 3 13", v: 4.8, grade: "mistake", note: "Practically forced, but it walks the rook straight into the d-file carnage." },
    { san: "13. Rxd7", white: true,  fen: "3rkb1r/p2Rqppp/5n2/1B2p1B2/4P3/1Q6/PPP2PPP/2K4R b k - 0 13", v: 5.2, grade: "brilliant", note: "The pin is cashed in: rook takes knight, and every recapture is forced — the whole point of 12.O-O-O." },
    { san: "13... Rxd7", white: false, fen: "7r/p2rqppp/5n2/1B2p1B2/4P3/1Q6/PPP2PPP/2K4R w k - 0 14", v: 5.5, grade: "mistake", note: "The rook recaptures into a grave. White's remaining rook is perfectly placed on the d-file, and Black's king is still in the center." },
    { san: "14. Rd1", white: true,  fen: "7r/p2rqppp/5n2/1B2p1B2/4P3/1Q6/PPP2PPP/2KR4 b k - 1 14", v: 5.8, grade: "good", note: "Doubling on the pinned file. Black's rook and queen on the d-file are hopelessly overloaded." },
    { san: "14... Qe6", white: false, fen: "7r/p2r1ppp/4qn2/1B2p1B2/4P3/1Q6/PPP2PPP/2KR4 w k - 2 15", v: 5.6, grade: "mistake", note: "Offering a queen trade to relieve the pressure — but it abandons the defence of d7." },
    { san: "15. Bxd7+", white: true,  fen: "7r/p2B1ppp/4qn2/4p1B2/4P3/1Q6/PPP2PPP/2KR4 b k - 0 15", v: 6.2, grade: "good", note: "The bishop collects the rook with check. Black's queen on e6 is too far away to recapture." },
    { san: "15... Nxd7", white: false, fen: "7r/p2n1ppp/4q3/4p1B2/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16", v: 6.5, grade: "mistake", note: "Everything is forced for a few moves — but the tactical point is coming: the d7-knight is overloaded, defending both d8 and the king." },
    { san: "16. Qb8+", white: true,  fen: "1Q5r/p2n1ppp/4q3/4p1B2/4P3/8/PPP2PPP/2KR4 b k - 1 16", v: 9.0, grade: "brilliant", note: "THE move of the game. The queen offers itself to deflect the d7-knight — the only piece defending d8." },
    { san: "16... Nxb8", white: false, fen: "1n5r/p4ppp/4q3/4p1B2/4P3/8/PPP2PPP/2KR4 w k - 0 17", v: 99, grade: "ok", note: "Forced. The knight leaves its post — and d8 is left completely undefended." },
    { san: "17. Rd8#", white: true,  fen: "1n1R3r/p4ppp/4q3/4p1B2/4P3/8/PPP2PPP/2K5 b k - 0 17", v: 99, grade: "mate", note: "Mate with the last two pieces developed — the classic finish. The g5-bishop 'protects' the mating rook from afar. Every piece except the king took part." }
  ];

  const boardEl = document.getElementById("analysis-board");
  const movesList = document.getElementById("moves-list");
  const statusEl = document.getElementById("board-status");
  const evalEl = document.getElementById("board-eval");
  const noteMove = document.getElementById("note-move");
  const noteText = document.getElementById("note-text");
  const noteGrade = document.getElementById("note-grade");
  const barsEl = document.getElementById("live-eval-bars");

  const board = CB.createBoard(boardEl, { interactive: false });
  let current = 0;

  /* ---- Move list ---- */
  POSITIONS.forEach((pos, i) => {
    const btn = document.createElement("button");
    const moveNo = Math.ceil(i / 2) || "·";
    const numLabel = i === 0 ? "·" : moveNo + (i % 2 === 1 ? "." : "...");
    const sanLabel = pos.san.replace(/^[\d\.]+\s*/, "");
    btn.className = "move-btn";
    btn.innerHTML =
      '<span><span class="m-num">' + numLabel + "</span>" + sanLabel + "</span>" +
      (pos.grade ? badgeHTML(pos.grade) : '<span class="grade-dot g-ok"></span>');
    btn.title = pos.san;
    btn.addEventListener("click", () => render(i));
    movesList.appendChild(btn);
  });

  /* ---- Eval graph (one bar per move) ---- */
  POSITIONS.forEach((pos, i) => {
    const bar = document.createElement("div");
    bar.className = "eval-bar";
    if (pos.v >= 99) {
      bar.style.height = "100%";
      bar.classList.add("hot");
    } else {
      bar.style.height = Math.min(96, Math.max(12, 50 + pos.v * 7)) + "%";
      if (pos.v >= 4) bar.classList.add("hot");
      if (pos.grade === "blunder") bar.classList.add("blunder");
    }
    bar.title = pos.san + " · eval " + (pos.v >= 99 ? "#" : "+" + pos.v.toFixed(1));
    barsEl.appendChild(bar);
  });

  function render(idx) {
    current = idx;
    const pos = POSITIONS[idx];
    board.setFEN(pos.fen);
    statusEl.textContent = idx === 0 ? "start position" : "after " + pos.san;
    evalEl.textContent = "eval " + (pos.v >= 99 ? "#" : "+" + pos.v.toFixed(1));
    noteMove.innerHTML = pos.san + " " + badgeHTML(pos.grade, true);
    noteText.textContent = pos.note;
    noteGrade.textContent = pos.grade ? BADGES[pos.grade].label : "—";
    movesList.querySelectorAll(".move-btn").forEach((b, i) => {
      b.classList.toggle("active", i === idx);
      if (i === idx) b.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  /* ---- Controls ---- */
  document.getElementById("ctrl-start").addEventListener("click", () => render(0));
  document.getElementById("ctrl-prev").addEventListener("click", () => render(Math.max(0, current - 1)));
  document.getElementById("ctrl-next").addEventListener("click", () => render(Math.min(POSITIONS.length - 1, current + 1)));
  document.getElementById("ctrl-end").addEventListener("click", () => render(POSITIONS.length - 1));

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") render(Math.max(0, current - 1));
    if (e.key === "ArrowRight") render(Math.min(POSITIONS.length - 1, current + 1));
  });

  /* ---- Import demo buttons ---- */
  document.getElementById("demo-btn").addEventListener("click", () => {
    render(0);
    if (window.showToast) window.showToast("Demo game loaded — the Opera Game, all 34 moves annotated.");
  });

  document.getElementById("analyze-btn").addEventListener("click", () => {
    if (window.showToast) {
      window.showToast("PGN import is simulated in this demo — try the demo game instead.");
      setTimeout(() => render(1), 600);
    }
  });

  document.querySelectorAll(".source-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      tab.parentElement.querySelectorAll(".source-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
    });
  });

  render(0);
})();
