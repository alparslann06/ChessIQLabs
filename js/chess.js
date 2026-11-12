/* ============================================================
   ChessIQLabs — js/chess.js
   Chessboard engine: FEN parsing, board rendering with ANIMATED
   piece movement, click selection, and pseudo-move application.

   Animation core:
   - setBoard(board, marks, moves): when the caller supplies the
     real move(s) (from/to), ONLY those pieces slide — exactly the
     piece that moved, plus castling rooks. Captured pieces fade
     out beneath, stationary pieces never animate.
   - Without move data the board transitions by teleport-fades
     (stationary pieces stay, differences fade) — it never guesses
     a slide, so no illegal-looking movement is ever shown.
   - "Zombie" recovery: pieces fading out can be revived when the
     next position needs them again (fast navigation), preventing
     ghost duplicates.
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

  /* Build a board. Returns { el, setBoard(board, marks, moves), setFEN, setMarks, squares }
     moves: optional array of {from, to} square names (e.g. {from:"e2", to:"e4"}).
     Castling = two entries (king + rook). */
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

    /* ---- Animated piece layer ---- */
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

    function spawnPiece(piece, index) {
      const holder = buildPieceHolder(piece);
      holder.classList.add("enter");
      place(holder, index);
      el.appendChild(holder);
      requestAnimationFrame(() => requestAnimationFrame(() => holder.classList.remove("enter")));
      return { el: holder, type: piece.type, color: piece.color, index: index };
    }

    /* Try to reuse a piece that is currently fading out (fast navigation) */
    function reviveZombie(piece, index) {
      let best = null, bestIdx = -1, bestDist = Infinity;
      for (let k = 0; k < zombies.length; k++) {
        const z = zombies[k];
        if (z.type !== piece.type || z.color !== piece.color) continue;
        const dr = Math.floor(z.index / 8) - Math.floor(index / 8);
        const dc = (z.index % 8) - (index % 8);
        const d = dr * dr + dc * dc;
        if (d < bestDist) { bestDist = d; best = z; bestIdx = k; }
      }
      if (!best) return null;
      zombies.splice(bestIdx, 1);
      clearTimeout(best.timer);
      best.el.classList.remove("exit");
      best.index = index;
      place(best.el, index);
      best.el.style.zIndex = 4;
      setTimeout(() => { best.el.style.zIndex = 3; }, 300);
      return best;
    }

    function fadeOut(p) {
      p.el.style.zIndex = 2;   /* fade beneath whatever replaces it */
      p.el.classList.add("exit");
      p.timer = setTimeout(() => {
        p.el.remove();
        const zi = zombies.indexOf(p);
        if (zi !== -1) zombies.splice(zi, 1);
      }, 240);
      zombies.push(p);
    }

    function normMoves(moves) {
      if (!moves || !moves.length) return null;
      return moves.map((m) => ({
        from: typeof m.from === "string" ? squareIndex(m.from) : m.from,
        to: typeof m.to === "string" ? squareIndex(m.to) : m.to
      }));
    }

    function syncPieces(oldBoard, newBoard, moves) {
      const remaining = pool.slice();
      pool = [];
      const mv = normMoves(moves);

      /* =========== EXACT MODE: the real move(s) are known =========== */
      if (mv && oldBoard) {
        const sources = new Set(mv.map((m) => m.from));
        const accounted = new Array(64).fill(false);

        /* 1. stationary pieces: same type/color on the same square,
              and not the source of a move → keep perfectly still */
        for (let i = 0; i < 64; i++) {
          const np = newBoard[i];
          if (!np || sources.has(i)) continue;
          const k = remaining.findIndex((p) => p.index === i && p.type === np.type && p.color === np.color);
          if (k !== -1) {
            const p = remaining.splice(k, 1)[0];
            p.el.style.zIndex = 3;
            pool.push(p);
            accounted[i] = true;
          }
        }

        /* 2. movers: slide exactly the given pieces. The mover's identity
              comes from the OLD board (what stood on m.from before the
              move) — this is what makes backward steps through captures
              work: the capturer slides home, the captured piece fades in
              at the capture square. */
        mv.forEach((m) => {
          const mp = oldBoard[m.from] || newBoard[m.to];
          if (!mp) return;
          let k = remaining.findIndex((p) => p.index === m.from && p.type === mp.type && p.color === mp.color);
          let p;
          if (k !== -1) {
            p = remaining.splice(k, 1)[0];
          } else {
            /* source element unavailable (rapid navigation) — revive or spawn at origin */
            p = reviveZombie(mp, m.from) || spawnPiece(mp, m.from);
          }
          p.index = m.to;
          place(p.el, m.to);
          p.el.style.zIndex = 4;
          setTimeout(() => { p.el.style.zIndex = 3; }, 300);
          pool.push(p);
          accounted[m.to] = true;
        });

        /* 3. everything left over vanished (captures) → fade out */
        remaining.forEach(fadeOut);

        /* 4. brand-new pieces (e.g. reversed capture) → fade in */
        for (let i = 0; i < 64; i++) {
          const np = newBoard[i];
          if (!np || accounted[i]) continue;
          pool.push(reviveZombie(np, i) || spawnPiece(np, i));
        }
        return;
      }

      /* =========== FALLBACK MODE: no move info — never guess ===========
         Stationary pieces stay put; every difference fades in/out. */
      const keep = new Array(64).fill(false);
      for (let i = 0; i < 64; i++) {
        const np = newBoard[i];
        if (!np) continue;
        const k = remaining.findIndex((p) => p.index === i && p.type === np.type && p.color === np.color);
        if (k !== -1) {
          const p = remaining.splice(k, 1)[0];
          p.el.style.zIndex = 3;
          pool.push(p);
          keep[i] = true;
        }
      }
      remaining.forEach(fadeOut);
      for (let i = 0; i < 64; i++) {
        const np = newBoard[i];
        if (!np || keep[i]) continue;
        pool.push(reviveZombie(np, i) || spawnPiece(np, i));
      }
    }

    function setBoard(board, newMarks, moves) {
      const old = currentBoard;
      currentBoard = board.slice();
      if (newMarks) marks = Object.assign({ sel: null, targets: [], last: [], hint: [] }, newMarks);
      paintSquares();
      syncPieces(old || new Array(64).fill(null), currentBoard, moves);
    }

    function setFEN(fen, newMarks, moves) {
      setBoard(parseFEN(fen), newMarks, moves);
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
