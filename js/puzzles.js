/* ============================================================
   ChessIQLabs — js/puzzles.js
   Interactive tactics trainer.
   Each puzzle: FEN + scripted solution tree. The user clicks
   a piece then a target square; correct moves advance the
   sequence, the opponent replies automatically.
   ============================================================ */

(function () {
  "use strict";
  if (!window.ChessBoard) return;

  const CB = window.ChessBoard;

  /* ---------- Puzzle data ----------
     steps: user moves; reply: forced opponent answer after each user move. */
  const PUZZLES = [
    {
      id: "p1",
      theme: "back-rank mate",
      difficulty: "Easy",
      rating: "~1100",
      fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
      goal: "Goal: checkmate in one. Black's king is sealed behind its own pawns.",
      lesson: "Back-rank mates are the most common finish in club chess. Before every move, ask: 'is my opponent's king sealed behind its pawns?'",
      steps: [
        {
          from: "a1", to: "a8", san: "Ra8#",
          reply: null,
          success: "Ra8# — the back rank was never defended. Simple, deadly, everywhere."
        }
      ]
    },
    {
      id: "p2",
      theme: "royal fork",
      difficulty: "Medium",
      rating: "~1600",
      fen: "r3k2r/2p2ppp/8/3N4/8/8/8/4K3 w kq - 0 1",
      goal: "Goal: win material with a double attack. One square attacks two things.",
      lesson: "Knights fork from one square to two. When a knight jump checks the king and hits another piece simultaneously, the king must move and the second piece falls.",
      steps: [
        {
          from: "d5", to: "c7", san: "Nc7+",
          reply: { from: "e8", to: "d7" },
          success: "Nc7+ — a royal fork: check on the king AND hitting the rook on a8."
        },
        {
          from: "c7", to: "a8", san: "Nxa8",
          reply: null,
          success: "Nxa8 — the rook is collected. Black will trap the knight eventually, but the exchange (and pawn) is yours."
        }
      ]
    },
    {
      id: "p3",
      theme: "queen sacrifice · mate in 2",
      difficulty: "Hard",
      rating: "~2100",
      fen: "r5k1/5ppp/8/8/8/8/5PPP/R3Q1K1 w - - 0 1",
      goal: "Goal: checkmate in two. It starts with a sacrifice that looks impossible.",
      lesson: "Deflection: when one defender guards two duties, you can overload it. The queen forces the rook onto the wrong square — then the second rook lands the mate it was guarding against.",
      steps: [
        {
          from: "e1", to: "e8", san: "Qe8+!!",
          reply: { from: "a8", to: "e8" },
          success: "Qe8+!! — the queen gives itself up. The rook MUST capture; there is no other legal reply."
        },
        {
          from: "a1", to: "e8", san: "Rxe8#",
          reply: null,
          success: "Rxe8# — the overloaded defender is gone and the back rank collapses. Mate."
        }
      ]
    }
  ];

  /* ---------- Elements ---------- */
  const boardEl = document.getElementById("puzzle-board");
  const tagEl = document.getElementById("puzzle-tag");
  const themeEl = document.getElementById("puzzle-theme");
  const ratingEl = document.getElementById("puzzle-rating");
  const goalEl = document.getElementById("puzzle-goal");
  const lessonEl = document.getElementById("puzzle-lesson");
  const statusEl = document.getElementById("puzzle-status");
  const statusText = document.getElementById("status-text");
  const streakNum = document.getElementById("streak-num");
  const streakFlames = document.getElementById("streak-flames");
  const progressFill = document.getElementById("progress-fill");
  const btnHint = document.getElementById("btn-hint");
  const btnReset = document.getElementById("btn-reset");
  const btnNext = document.getElementById("btn-next");

  const board = CB.createBoard(boardEl, { interactive: true });

  /* ---------- State ---------- */
  let puzzleIdx = 0;
  let stepIdx = 0;            // index into puzzle.steps
  let phase = "user";         // 'user' | 'reply' | 'done'
  let boardState = [];
  let selected = null;
  let solvedStreak = 0;
  let busy = false;
  let resetting = false;
  let playedMoves = [];       // {from, to} in the order they were played

  function loadStreak() {
    solvedStreak = parseInt(localStorage.getItem("cql-streak") || "0", 10);
    renderStreak();
  }
  function renderStreak() {
    streakNum.textContent = String(solvedStreak);
    const flames = solvedStreak >= 5 ? "🔥🔥🔥" : solvedStreak >= 2 ? "🔥🔥" : solvedStreak >= 1 ? "🔥" : "🔥🔥🔥";
    streakFlames.textContent = solvedStreak >= 1 ? "🔥".repeat(Math.min(3, solvedStreak)) : flames;
  }

  function setStatus(text, cls) {
    statusText.textContent = text;
    statusEl.className = "puzzle-status" + (cls ? " " + cls : "");
  }

  function clearTransientMarks() {
    boardEl.querySelectorAll(".sq.wrong").forEach((s) => s.classList.remove("wrong"));
  }

  function loadPuzzle(idx) {
    puzzleIdx = idx;
    stepIdx = 0;
    phase = "user";
    selected = null;
    busy = false;
    playedMoves = [];
    const p = PUZZLES[puzzleIdx];
    boardState = CB.parseFEN(p.fen);
    board.setBoard(boardState);   // puzzle switch = teleport (fade)
    tagEl.textContent = "PUZZLE " + (puzzleIdx + 1) + " / " + PUZZLES.length;
    themeEl.textContent = p.theme;
    ratingEl.textContent = "rating " + p.rating + " · " + p.difficulty;
    goalEl.textContent = p.goal;
    lessonEl.textContent = p.lesson;
    btnNext.disabled = true;
    progressFill.style.width = "0%";
    setStatus("White to move — find the best idea.");
  }

  /* ---------- Interaction ---------- */
  function onSquareClick(squareName) {
    if (busy || phase === "done") return;
    clearTransientMarks();

    const step = PUZZLES[puzzleIdx].steps[stepIdx];
    const clicked = boardState[CB.squareIndex(squareName)];

    if (selected) {
      // attempt a move
      if (squareName === selected) {
        selected = null;
        board.setMarks({});
        return;
      }
      if (squareName === step.to && selected === step.from) {
        playUserMove();
        return;
      }
      // wrong move
      boardEl.classList.remove("shake");
      void boardEl.offsetWidth; // restart animation
      boardEl.classList.add("shake");
      const wrongSquares = [CB.squareIndex(squareName), CB.squareIndex(selected)];
      wrongSquares.forEach((i) => board.squares[i].classList.add("wrong"));
      setStatus("Not quite — look for the strongest forcing move.", "err");
      setTimeout(() => clearTransientMarks(), 600);
      return;
    }

    // select a white piece
    if (clicked && clicked.color === "w") {
      selected = squareName;
      const targets = [{ from: step.to, capture: !!boardState[CB.squareIndex(step.to)] }];
      board.setMarks({ sel: squareName, targets });
    } else if (clicked && clicked.color === "b") {
      setStatus("It's White to move — pick one of the white pieces.", "err");
      setTimeout(() => setStatus(phase === "done" ? statusText.textContent : "White to move — find the best idea."), 1400);
    }
  }

  function playUserMove() {
    const step = PUZZLES[puzzleIdx].steps[stepIdx];
    busy = true;
    boardState = CB.applyMove(boardState, step.from, step.to);
    playedMoves.push({ from: step.from, to: step.to });
    selected = null;
    board.setBoard(boardState, { last: [step.from, step.to] }, [{ from: step.from, to: step.to }]);
    setStatus("✔ " + step.san + " — " + step.success, "ok");
    progressFill.style.width = Math.round(((stepIdx + 1) / PUZZLES[puzzleIdx].steps.length) * 100) + "%";

    const isLast = stepIdx === PUZZLES[puzzleIdx].steps.length - 1;

    if (step.reply) {
      phase = "reply";
      setTimeout(() => {
        boardState = CB.applyMove(boardState, step.reply.from, step.reply.to);
        playedMoves.push({ from: step.reply.from, to: step.reply.to });
        board.setBoard(boardState, { last: [step.reply.from, step.reply.to] },
          [{ from: step.reply.from, to: step.reply.to }]);
        stepIdx++;
        phase = "user";
        busy = false;
        setStatus("Black replied. Now finish the combination.", "ok");
      }, 700);
    } else if (isLast) {
      phase = "done";
      busy = false;
      btnNext.disabled = false;
      if (puzzleIdx === PUZZLES.length - 1) {
        solvedStreak++;
        localStorage.setItem("cql-streak", String(solvedStreak));
        renderStreak();
        if (window.showToast) window.showToast("Set complete! Streak: " + solvedStreak + " — reloading the set.");
      }
    } else {
      phase = "user";
      stepIdx++;
      busy = false;
    }
  }

  /* ---------- Buttons ---------- */
  btnHint.addEventListener("click", () => {
    if (phase === "done") return;
    const step = PUZZLES[puzzleIdx].steps[stepIdx];
    board.setMarks({ hint: [step.from], last: [] });
    setStatus("Hint: the move starts on " + step.from + " with a " + pieceName(step.from) + ".", "");
    setTimeout(() => board.setMarks({}), 2000);
  });

  function pieceName(sq) {
    const p = boardState[CB.squareIndex(sq)];
    const names = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
    return p ? names[p.type] : "piece";
  }

  /* Reset: undo every played move in reverse — each undo is a real
     move, so pieces slide back exactly the way they came and captured
     pieces fade back in where they were taken. */
  btnReset.addEventListener("click", () => {
    if (busy || resetting || playedMoves.length === 0) return;
    resetting = true;
    selected = null;
    board.setMarks({});
    clearTransientMarks();

    /* rebuild the position after each played move, start → current */
    const states = [CB.parseFEN(PUZZLES[puzzleIdx].fen)];
    playedMoves.forEach((m) => states.push(CB.applyMove(states[states.length - 1], m.from, m.to)));

    let i = states.length - 1;
    (function stepBack() {
      i--;
      if (i < 0) {
        boardState = states[0];
        playedMoves = [];
        stepIdx = 0;
        phase = "user";
        resetting = false;
        btnNext.disabled = true;
        progressFill.style.width = "0%";
        setStatus("White to move — find the best idea.");
        return;
      }
      const m = playedMoves[i];   // the move that went states[i] → states[i+1]
      boardState = states[i];
      board.setBoard(boardState, null, [{ from: m.to, to: m.from }]);
      setTimeout(stepBack, 280);
    })();
  });

  btnNext.addEventListener("click", () => {
    const nextIdx = (puzzleIdx + 1) % PUZZLES.length;
    loadPuzzle(nextIdx);
  });

  /* ---------- Wire clicks ---------- */
  boardEl.addEventListener("click", (e) => {
    const sq = e.target.closest(".sq");
    if (sq && sq.dataset.square) onSquareClick(sq.dataset.square);
  });

  /* ---------- Init ---------- */
  loadStreak();
  loadPuzzle(0);
})();
