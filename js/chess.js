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

  function distSq(a, b) {
    const dr = Math.floor(a / 8) - Math.floor(b / 8);
    const dc = (a % 8) - (b % 8);
    return dr * dr + dc * dc;
  }

  /* Can a piece of this type plausibly make this move? Used ONLY for
     fallback transitions (when the real move is unknown): a slide is
     shown only if its shape is legal for that piece — pawns can never
     slide sideways or backward, sliders only on straight lines, etc. */
  function plausibleMove(type, color, from, to) {
    const dr = Math.floor(to / 8) - Math.floor(from / 8);
    const dc = (to % 8) - (from % 8);
    const adr = Math.abs(dr), adc = Math.abs(dc);
    if (adr === 0 && adc === 0) return false;
    switch (type) {
      case "p": {
        /* rows run 8→1, so White moves toward smaller row indexes */
        if (color === "w") {
          if (dc === 0) return dr === -1 || (dr === -2 && Math.floor(from / 8) === 6);
          return dr === -1 && adc === 1;
        }
        if (dc === 0) return dr === 1 || (dr === 2 && Math.floor(from / 8) === 1);
        return dr === 1 && adc === 1;
      }
      case "n": return (adr === 2 && adc === 1) || (adr === 1 && adc === 2);
      case "b": return adr === adc;
      case "r": return dr === 0 || dc === 0;
      case "q": return adr === adc || dr === 0 || dc === 0;
      case "k": return adr <= 1 && adc <= 1;
    }
    return false;
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

    /* Revive a piece that is currently fading out — but ONLY if it is
       already standing on the exact target square (fast-navigation case).
       A revived piece is never repositioned, so it can never be seen
       sliding in from somewhere else. */
    function reviveZombie(piece, index) {
      for (let k = 0; k < zombies.length; k++) {
        const z = zombies[k];
        if (z.index !== index || z.type !== piece.type || z.color !== piece.color) continue;
        zombies.splice(k, 1);
        clearTimeout(z.timer);
        z.el.classList.remove("exit");
        z.el.style.zIndex = 4;
        setTimeout(() => { z.el.style.zIndex = 3; }, 300);
        return z;
      }
      return null;
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

      /* =========== FALLBACK MODE: no move info — never guess wildly ===
         Stationary pieces stay put. A displaced piece slides only when
         the move shape is legal for its type (plausibleMove); everything
         else fades in/out. A pawn can therefore NEVER be seen sliding
         sideways or backward, in any mode. */
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
      for (let i = 0; i < 64; i++) {
        const np = newBoard[i];
        if (!np || keep[i]) continue;
        let best = null, bestIdx = -1, bestDist = Infinity;
        for (let k = 0; k < remaining.length; k++) {
          const p = remaining[k];
          if (p.type !== np.type || p.color !== np.color) continue;
          if (!plausibleMove(p.type, p.color, p.index, i)) continue;
          const d = distSq(p.index, i);
          if (d < bestDist) { bestDist = d; best = p; bestIdx = k; }
        }
        if (best) {
          remaining.splice(bestIdx, 1);
          best.index = i;
          place(best.el, i);
          best.el.style.zIndex = 4;
          setTimeout(() => { best.el.style.zIndex = 3; }, 300);
          pool.push(best);
        } else {
          pool.push(reviveZombie(np, i) || spawnPiece(np, i));
        }
      }
      remaining.forEach(fadeOut);
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
