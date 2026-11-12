/* ============================================================
   ChessIQLabs — js/chess.js
   Chessboard engine: FEN parsing, board rendering with ANIMATED
   piece movement, click selection, and pseudo-move application.

   Animation core (bug-fixed):
   - Pass 1: pieces already standing on the same square are kept
     in place and NEVER animated.
   - Pass 2: displaced pieces slide only when the match is
     unambiguous (single candidate) or a plausible move distance
     (knight = max 2 squares). Everything else fades in/out.
   - "Zombie" recovery: pieces fading out from a capture can be
     revived if the very next position needs them again (fast
     navigation), preventing ghost duplicates.
   ============================================================ */

(function () {
  "use strict";

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

  /* Unicode glyph set — fallback when piece images can't load */
  const GLYPHS = { k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };

  /* Vector piece set: chess.com's "neo" pieces (rounded style), served
     from chess.com's CDN as PNGs. Offline → glyph fallback via onerror. */
  const PIECE_IMG_BASE = "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/";

  /* Max squared distance for a "plausible slide" when the piece identity
     is ambiguous. A knight jump is at most 2+2*... : |dr|<=2, |dc|<=1 → d<=5.
     8 covers knight moves with margin; anything farther fades instead. */
  const MAX_SLIDE_DIST_SQ = 8;

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

  function distSq(a, b) {
    const dr = Math.floor(a / 8) - Math.floor(b / 8);
    const dc = (a % 8) - (b % 8);
    return dr * dr + dc * dc;
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
       transform. A diff between consecutive boards slides only the
       pieces that actually moved. */
    let currentBoard = null;
    let pool = [];     // live pieces: { el, type, color, index }
    let zombies = [];  // fading-out pieces, recoverable: { el, type, color, index, timer }
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

    /* Try to reuse a piece that is currently fading out (fast navigation) */
    function reviveZombie(piece, index) {
      let best = null, bestIdx = -1, bestDist = Infinity;
      for (let k = 0; k < zombies.length; k++) {
        const z = zombies[k];
        if (z.type !== piece.type || z.color !== piece.color) continue;
        const d = distSq(z.index, index);
        if (d < bestDist) { bestDist = d; best = z; bestIdx = k; }
      }
      if (!best) return null;
      zombies.splice(bestIdx, 1);
      clearTimeout(best.timer);
      best.el.classList.remove("exit");
      best.index = index;
      place(best.el, index);
      best.el.style.zIndex = 4;
      setTimeout(() => { best.el.style.zIndex = 3; }, 280);
      return best;
    }

    function spawnPiece(piece, index) {
      const holder = buildPieceHolder(piece);
      holder.classList.add("enter");
      place(holder, index);
      el.appendChild(holder);
      const entry = { el: holder, type: piece.type, color: piece.color, index: index };
      requestAnimationFrame(() => requestAnimationFrame(() => holder.classList.remove("enter")));
      return entry;
    }

    function syncPieces(oldBoard, newBoard) {
      const remaining = pool.slice();
      pool = [];
      const consumed = new Array(64).fill(false);

      /* ---- Pass 1: same piece on the same square → keep perfectly still ---- */
      for (let i = 0; i < 64; i++) {
        const np = newBoard[i];
        if (!np) continue;
        for (let k = 0; k < remaining.length; k++) {
          const p = remaining[k];
          if (p.index === i && p.type === np.type && p.color === np.color) {
            remaining.splice(k, 1);
            p.el.style.zIndex = 3;
            pool.push(p);
            consumed[i] = true;
            break;
          }
        }
      }

      /* ---- Pass 2: displaced pieces — slide only when it makes sense ---- */
      for (let i = 0; i < 64; i++) {
        if (consumed[i]) continue;
        const np = newBoard[i];
        if (!np) continue;

        let best = null, bestIdx = -1, bestDist = Infinity, candidates = 0;
        for (let k = 0; k < remaining.length; k++) {
          const p = remaining[k];
          if (p.type !== np.type || p.color !== np.color) continue;
          candidates++;
          const d = distSq(p.index, i);
          if (d < bestDist) { bestDist = d; best = p; bestIdx = k; }
        }

        /* Slide only when unambiguous (one candidate → it must be the mover)
           or when the distance is a plausible single-move distance. */
        if (best && (candidates === 1 || bestDist <= MAX_SLIDE_DIST_SQ)) {
          remaining.splice(bestIdx, 1);
          best.index = i;
          place(best.el, i);
          best.el.style.zIndex = 4;
          setTimeout(() => { best.el.style.zIndex = 3; }, 280);
          pool.push(best);
        } else {
          /* No sensible animation → fade in a fresh (or revived) piece */
          const revived = reviveZombie(np, i);
          pool.push(revived || spawnPiece(np, i));
        }
      }

      /* ---- Everything unmatched fades out (captures, disappearances) ---- */
      remaining.forEach((p) => {
        const entry = p;
        entry.el.style.zIndex = 2;
        entry.el.classList.add("exit");
        entry.timer = setTimeout(() => {
          entry.el.remove();
          const zi = zombies.indexOf(entry);
          if (zi !== -1) zombies.splice(zi, 1);
        }, 240);
        zombies.push(entry);
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
