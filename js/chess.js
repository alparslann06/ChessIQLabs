/* ============================================================
   ChessIQLabs — js/chess.js
   Minimal chessboard engine: FEN parsing, board rendering,
   click selection, and pseudo-move application.
   No external libraries. Vanilla JS.
   ============================================================ */

(function () {
  "use strict";

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

  /* Unicode glyph set — one glyph per piece type, colored via CSS (fallback) */
  const GLYPHS = { k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };

  /* Vector piece set: chess.com's "neo" pieces (the rounded set from the
     reference screenshot), served from chess.com's CDN. PNGs at 150px scale.
     If images fail to load (offline), we fall back to Unicode glyphs. */
  const PIECE_IMG_BASE = "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/";

  /* Parse the board part of a FEN into a flat 64-array.
     Index 0 = a8, index 7 = h8, index 63 = h1 (row-major, white orientation).
     Each cell: null or { type:'p', color:'w' } */
  function parseFEN(fen) {
    const board = new Array(64).fill(null);
    const rows = fen.split(" ")[0].split("/");
    for (let r = 0; r < 8; r++) {
      let file = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) { file += parseInt(ch, 10); continue; }
        const color = ch === ch.toUpperCase() ? "w" : "b";
        board[r * 8 + file] = { type: ch.toLowerCase(), color };
        file++;
      }
    }
    return board;
  }

  function squareName(index) {
    return FILES[index % 8] + (8 - Math.floor(index / 8));
  }

  function squareIndex(name) {
    const f = FILES.indexOf(name[0]);
    const r = 8 - parseInt(name[1], 10);
    return r * 8 + f;
  }

  /* Build the DOM for a board. Returns { el, setBoard(board, marks) } */
  function createBoard(el, options) {
    options = options || {};
    const interactive = !!options.interactive;
    const coords = options.coords !== false;
    el.classList.add("board");

    const squares = [];
    for (let i = 0; i < 64; i++) {
      const sq = document.createElement("div");
      const row = Math.floor(i / 8), col = i % 8;
      sq.className = "sq " + ((row + col) % 2 === 0 ? "light" : "dark");
      sq.dataset.square = squareName(i);
      squares.push(sq);
      if (coords && (row === 7 || col === 0)) {
        if (col === 0) {
          const c = document.createElement("span");
          c.className = "coord rank";
          c.textContent = String(8 - row);
          sq.appendChild(c);
        }
        if (row === 7) {
          const c = document.createElement("span");
          c.className = "coord file";
          c.textContent = FILES[col];
          sq.appendChild(c);
        }
      }
      el.appendChild(sq);
    }

    let currentBoard = null;
    let marks = { sel: null, targets: [], last: [], hint: [] };

    function paint() {
      for (let i = 0; i < 64; i++) {
        const sq = squares[i];
        const piece = currentBoard ? currentBoard[i] : null;
        // keep coordinate labels
        sq.querySelectorAll(".piece, .piece-img").forEach((p) => p.remove());
        if (piece) {
          const img = document.createElement("img");
          img.className = "piece-img";
          img.alt = "";
          img.draggable = false;
          img.src = PIECE_IMG_BASE + piece.color + piece.type + ".png";
          img.onerror = function () {
            // Offline fallback: Unicode glyph colored via CSS
            const span = document.createElement("span");
            span.className = "piece " + (piece.color === "w" ? "white" : "black");
            span.textContent = GLYPHS[piece.type];
            img.replaceWith(span);
          };
          sq.appendChild(img);
        }
        const name = sq.dataset.square;
        sq.classList.toggle("sel", marks.sel === name);
        sq.classList.toggle("last", marks.last.includes(name));
        sq.classList.toggle("hint-sq", marks.hint.includes(name));
        const target = marks.targets.find((t) => t.from === name);
        sq.classList.toggle("target", !!target);
        sq.classList.toggle("capture", !!(target && target.capture));
        sq.classList.toggle("clickable", interactive && (!!target || !!sq.querySelector(".piece")));
      }
    }

    function setBoard(board, newMarks) {
      currentBoard = board;
      if (newMarks) marks = Object.assign({ sel: null, targets: [], last: [], hint: [] }, newMarks);
      paint();
    }

    function setFEN(fen, newMarks) {
      setBoard(parseFEN(fen), newMarks);
    }

    function setMarks(newMarks) {
      marks = Object.assign({ sel: null, targets: [], last: [], hint: [] }, newMarks);
      paint();
    }

    return { el, setBoard, setFEN, setMarks, squares };
  }

  /* Auto-render every element with [data-board] that isn't interactive */
  function autoRender() {
    document.querySelectorAll(".board[data-fen]").forEach((el) => {
      if (el.dataset.rendered) return;
      el.dataset.rendered = "1";
      const b = createBoard(el, { interactive: false });
      b.setFEN(el.dataset.fen);
    });
  }

  /* Apply a simple move on a 64-board array (no castling / en passant —
     the demo puzzles and walkthrough don't need them). Returns a new array. */
  function applyMove(board, fromName, toName) {
    const from = squareIndex(fromName);
    const to = squareIndex(toName);
    const next = board.slice();
    next[to] = next[from];
    next[from] = null;
    return next;
  }

  window.ChessBoard = {
    parseFEN,
    applyMove,
    squareIndex,
    squareName,
    createBoard,
    autoRender,
    FILES,
    GLYPHS,
  };
})();
