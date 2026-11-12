/* ============================================================
   ChessIQLabs — js/chess.js
   Chessboard engine: FEN parsing, board rendering with ANIMATED
   piece movement (persistent piece elements sliding between
   squares, captures fading out), click selection, and
   pseudo-move application. No external libraries.
   ============================================================ */

(function () {
  "use strict";

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

  /* Unicode glyph set — fallback when piece images can't load */
  const GLYPHS = { k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };

  /* Vector piece set: chess.com's "neo" pieces (rounded style), served
     from chess.com's CDN as PNGs. Offline → glyph fallback via onerror. */
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

  /* Build a board. Returns { el, setBoard(board, marks), setFEN, setMarks, squares } */
  function createBoard(el, options) {
    options = options || {};
    const interactive = !!options.interactive;
    const coords = options.coords !== false;
    el.classList.add("board");

    /* ---- Squares (colors, coordinates, highlight layers) ---- */
    const squares = [];
    for (let i = 0; i < 64; i++) {
      const sq = document.createElement("div");
      const row = Math.floor(i / 8), col = i % 8;
      sq.className = "sq " + ((row + col) % 2 === 0 ? "light" : "dark");
      sq.dataset.square = squareName(i);
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
      squares.push(sq);
    }

    /* ---- Animated piece layer ----
       Pieces are absolutely-positioned elements ON the board, moved via
       transform. A diff between consecutive boards slides them smoothly. */
    let currentBoard = null;
    let pool = [];   // { el, type, color, index }
    let marks = { sel: null, targets: [], last: [], hint: [] };

    function place(holder, index) {
      const row = Math.floor(index / 8), col = index % 8;
      holder.style.transform = "translate(" + col * 100 + "%," + row * 100 + "%)";
    }

    function buildPieceHolder(piece) {
      const holder = document.createElement("div");
      holder.className = "bpiece";
      const img = document.createElement("img");
      img.className = "piece-img";
      img.alt = "";
      img.draggable = false;
      img.src = PIECE_IMG_BASE + piece.color + piece.type + ".png";
      img.onerror = function () {
        const span = document.createElement("span");
        span.className = "piece " + (piece.color === "w" ? "white" : "black");
        span.textContent = GLYPHS[piece.type];
        img.replaceWith(span);
      };
      holder.appendChild(img);
      return holder;
    }

    function paintSquares() {
      for (let i = 0; i < 64; i++) {
        const sq = squares[i];
        const name = sq.dataset.square;
        const target = marks.targets.find((t) => t.from === name);
        sq.classList.toggle("sel", marks.sel === name);
        sq.classList.toggle("last", marks.last.includes(name));
        sq.classList.toggle("hint-sq", marks.hint.includes(name));
        sq.classList.toggle("target", !!target);
        sq.classList.toggle("capture", !!(target && target.capture));
        sq.classList.toggle("clickable", interactive && (!!target || marks.sel === name));
      }
    }

    function syncPieces(oldBoard, newBoard) {
      const remaining = pool.slice();
      pool = [];

      for (let i = 0; i < 64; i++) {
        const np = newBoard[i];
        if (!np) continue;

        /* find the closest same-type-same-color piece to slide in */
        let best = null, bestIdx = -1, bestDist = Infinity;
        for (let k = 0; k < remaining.length; k++) {
          const p = remaining[k];
          if (p.type !== np.type || p.color !== np.color) continue;
          const dr = Math.floor(p.index / 8) - Math.floor(i / 8);
          const dc = (p.index % 8) - (i % 8);
          const d = dr * dr + dc * dc;
          if (d < bestDist) { bestDist = d; best = p; bestIdx = k; }
        }

        if (best) {
          remaining.splice(bestIdx, 1);
          best.index = i;
          place(best.el, i);
          best.el.style.zIndex = 4;   /* moving piece rides above others */
          pool.push(best);
        } else {
          const holder = buildPieceHolder(np);
          holder.classList.add("enter");
          place(holder, i);
          el.appendChild(holder);
          const entry = { el: holder, type: np.type, color: np.color, index: i };
          pool.push(entry);
          requestAnimationFrame(() => requestAnimationFrame(() => holder.classList.remove("enter")));
        }
      }

      /* pieces that vanished (captures) fade out beneath the capturer */
      remaining.forEach((p) => {
        p.el.style.zIndex = 2;
        p.el.classList.add("exit");
        setTimeout(() => p.el.remove(), 220);
      });
    }

    function setBoard(board, newMarks) {
      const old = currentBoard;
      currentBoard = board.slice();
      if (newMarks) marks = Object.assign({ sel: null, targets: [], last: [], hint: [] }, newMarks);
      paintSquares();
      syncPieces(old || new Array(64).fill(null), currentBoard);
    }

    function setFEN(fen, newMarks) {
      setBoard(parseFEN(fen), newMarks);
    }

    function setMarks(newMarks) {
      marks = Object.assign({ sel: null, targets: [], last: [], hint: [] }, newMarks);
      paintSquares();
    }

    return { el, setBoard, setFEN, setMarks, squares };
  }

  /* Auto-render decorative boards (data-fen) that aren't interactive */
  function autoRender() {
    document.querySelectorAll(".board[data-fen]").forEach((el) => {
      if (el.dataset.rendered) return;
      el.dataset.rendered = "1";
      const b = createBoard(el, { interactive: false });
      b.setFEN(el.dataset.fen);
    });
  }

  /* Apply a simple move on a 64-board array (no castling / en passant —
     the demo puzzles don't need them). Returns a new array. */
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
