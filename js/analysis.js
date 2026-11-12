/* ============================================================
   ChessIQLabs — js/analysis.js
   Interactive annotated walkthrough of the "Opera Game"
   (Morphy vs. Duke of Brunswick & Count Isouard, Paris 1858).
   ============================================================ */

(function () {
  "use strict";
  if (!window.ChessBoard) return;

  const CB = window.ChessBoard;

  /* Key positions of the Opera Game with commentary.
     Evals are illustrative, styled after an engine report. */
  const POSITIONS = [
    {
      san: "Start",
      moveNo: 0,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      evalCp: 0.0,
      evalText: "0.0",
      grade: null,
      gradeText: "—",
      note: "The most famous game in chess history. Morphy, playing White, is about to demonstrate what development really means."
    },
    {
      san: "3...Bg4",
      moveNo: 3,
      fen: "rn1qkbnr/pppp1ppp/3p4/4p3/3PP1b1/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4",
      evalCp: 0.4,
      evalText: "+0.4",
      grade: "g-ok",
      gradeText: "Inaccuracy",
      note: "Black's bishop pin is natural-looking but passive. Meanwhile White has a huge space advantage in the center — Black's pieces are getting in each other's way."
    },
    {
      san: "5...dxe5",
      moveNo: 5,
      fen: "rn1qkbnr/ppp2ppp/8/4p3/4P3/5Q2/PPP2PPP/RNB1KB1R w KQkq - 0 6",
      evalCp: 0.8,
      evalText: "+0.8",
      grade: "g-ok",
      gradeText: "Good",
      note: "Trades so far are normal. But notice: Black has made three pawn or bishop moves and still only two pieces in play. White's queen is already out and active on f3."
    },
    {
      san: "7.Qb3!",
      moveNo: 7,
      fen: "rn1qkb1r/pppp1ppp/5n2/4p3/2B1P3/1Q6/PPP2PPP/RNB1KB1R b kq - 0 7",
      evalCp: 1.1,
      evalText: "+1.1",
      grade: "g-good",
      gradeText: "Best",
      note: "A double attack on b7 and f7 — both weak because the d7-square and the light squares are under-defended. Black must react to the threat immediately."
    },
    {
      san: "9...b5?",
      moveNo: 9,
      fen: "rn2kb1r/p3q1pp/2p2n2/1p2p1B2/2B1P3/1Q1N4/PPP2PPP/R3K2R w KQkq - 0 10",
      evalCp: 2.4,
      evalText: "+2.4",
      grade: "g-blunder",
      gradeText: "Blunder −1.3",
      note: "The losing move of the game. Trying to chase the bishop with pawns, Black opens critical lines on the queenside and abandons d7 forever. 9...Qb4+ or 9...Nbd7 was necessary."
    },
    {
      san: "11...Nbd7",
      moveNo: 11,
      fen: "r3kb1r/p2n1ppp/5n2/1B2p1B2/4P3/1Q6/PPP2PPP/R3K2R w KQkq - 0 12",
      evalCp: 3.5,
      evalText: "+3.5",
      grade: "g-good",
      gradeText: "Forced",
      note: "Black is materially fine (a pawn up) but strategically lost: the f6-knight is pinned by Bg5, d7 is a parking lot, and White is about to castle into an attack with every piece aimed at d7."
    },
    {
      san: "13...Rxd7",
      moveNo: 13,
      fen: "7r/p2rqppp/5n2/1B2p1B2/4P3/1Q6/PPP2PPP/2KR3R w k - 0 14",
      evalCp: 5.5,
      evalText: "+5.5",
      grade: "g-mistake",
      gradeText: "Mistake",
      note: "The rook recaptures into a grave. White's rooks are perfectly placed on the d-file, and Black's king is still in the center with the knight pinned. White now has a decisive lead in force near d7."
    },
    {
      san: "15...Nxd7",
      moveNo: 15,
      fen: "7r/p2n1ppp/4q3/4p1B2/4P3/1Q6/PPP2PPP/2KR3R w k - 0 16",
      evalCp: 6.0,
      evalText: "+6.0",
      grade: "g-mistake",
      gradeText: "Mistake",
      note: "Everything is forced for a few moves, but the tactical point is coming: the knight on d7 is hopelessly overloaded defending d8 and the king. Morphy has counted the exact continuation."
    },
    {
      san: "17.Rd8#",
      moveNo: 17,
      fen: "1n1R3r/p4ppp/4q3/4p1B2/4P3/8/PPP2PPP/2K4R b k - 0 17",
      evalCp: 99,
      evalText: "#",
      grade: "g-brilliant",
      gradeText: "Checkmate",
      note: "Mate with the last two pieces developed — the classic finish. Qb8+!! sacrificed the queen to deflect the d7-knight, and Rd8# delivered mate by a rook 'protected' by the g5-bishop. Morphy's entire army except the king took part."
    }
  ];

  const boardEl = document.getElementById("analysis-board");
  const movesList = document.getElementById("moves-list");
  const statusEl = document.getElementById("board-status");
  const evalEl = document.getElementById("board-eval");
  const noteMove = document.getElementById("note-move");
  const noteText = document.getElementById("note-text");
  const noteGrade = document.getElementById("note-grade");

  const board = CB.createBoard(boardEl, { interactive: false });
  let current = 0;

  function gradeHTML(grade, text) {
    if (!grade) return "—";
    return '<span style="display:inline-flex;align-items:center;gap:6px"><span class="grade-dot ' + grade + '"></span>' + text + "</span>";
  }

  function render(idx) {
    current = idx;
    const pos = POSITIONS[idx];
    board.setFEN(pos.fen);
    statusEl.textContent = pos.moveNo === 0 ? "start position" : "after " + pos.san;
    evalEl.textContent = "eval " + pos.evalText;
    noteMove.textContent = pos.san;
    noteText.textContent = pos.note;
    noteGrade.innerHTML = gradeHTML(pos.grade, pos.gradeText);
    movesList.querySelectorAll(".move-btn").forEach((b, i) =>
      b.classList.toggle("active", i === idx)
    );
  }

  /* Build move list */
  POSITIONS.forEach((pos, i) => {
    const btn = document.createElement("button");
    btn.className = "move-btn";
    btn.innerHTML =
      '<span><span class="m-num">' + (pos.moveNo === 0 ? "·" : pos.moveNo) + "</span>" + pos.san + "</span>" +
      '<span class="grade-dot ' + (pos.grade || "g-ok") + '"></span>';
    btn.addEventListener("click", () => render(i));
    movesList.appendChild(btn);
  });

  /* Controls */
  document.getElementById("ctrl-start").addEventListener("click", () => render(0));
  document.getElementById("ctrl-prev").addEventListener("click", () => render(Math.max(0, current - 1)));
  document.getElementById("ctrl-next").addEventListener("click", () => render(Math.min(POSITIONS.length - 1, current + 1)));
  document.getElementById("ctrl-end").addEventListener("click", () => render(POSITIONS.length - 1));

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") render(Math.max(0, current - 1));
    if (e.key === "ArrowRight") render(Math.min(POSITIONS.length - 1, current + 1));
  });

  /* Import demo — this demo build ships with one preloaded game */
  document.getElementById("demo-btn").addEventListener("click", () => {
    render(1);
    if (window.showToast) window.showToast("Demo game loaded — the Opera Game, annotated.");
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

  /* Init */
  render(0);
})();
