import React, { useEffect, useMemo, useRef, useState } from "react";
import "./Minesweeper.css";

const DIFFICULTIES = {
  Easy:   { size: 8,  mines: 10 },
  Medium: { size: 12, mines: 22 },
  Hard:   { size: 16, mines: 40 },
};

function makeEmptyBoard(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      count: 0,
    }))
  );
}

function neighbors(size, x, y) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) out.push([nx, ny]);
    }
  }
  return out;
}

function placeMines(board, size, mines, safeX, safeY) {
  // Don’t place on first click or its neighbors
  const forbidden = new Set([`${safeX},${safeY}`]);
  for (const [nx, ny] of neighbors(size, safeX, safeY)) forbidden.add(`${nx},${ny}`);

  let placed = 0;
  while (placed < mines) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    if (!board[y][x].mine && !forbidden.has(`${x},${y}`)) {
      board[y][x].mine = true;
      placed++;
    }
  }

  // Count around each non-mine
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x].mine) continue;
      board[y][x].count = neighbors(size, x, y).reduce(
        (acc, [nx, ny]) => acc + (board[ny][nx].mine ? 1 : 0),
        0
      );
    }
  }
}

export default function MinesweeperApp() {
  const [difficulty, setDifficulty] = useState("Easy");
  const { size, mines } = DIFFICULTIES[difficulty];

  const [board, setBoard] = useState(() => makeEmptyBoard(size));
  const [minesLeft, setMinesLeft] = useState(mines);
  const [state, setState] = useState("ready"); // "ready" | "playing" | "won" | "lost"
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef(null);

  // Reset when difficulty changes
  useEffect(() => {
    setBoard(makeEmptyBoard(size));
    setMinesLeft(mines);
    setState("ready");
    setSeconds(0);
    clearInterval(timerRef.current);
  }, [size, mines]);

  // Timer
  useEffect(() => {
    clearInterval(timerRef.current);
    if (state === "playing") {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [state]);

  const totalSafe = size * size - mines;
  const revealedSafe = useMemo(
    () => board.flat().filter((c) => c.revealed && !c.mine).length,
    [board]
  );

  // Ensure mines are seeded on the first click and return the working board for this click
  function ensureStarted(x, y) {
    if (state !== "ready") return board;
    const seeded = board.map(r => r.map(c => ({ ...c })));
    placeMines(seeded, size, mines, x, y);
    setBoard(seeded);          // schedule for next render
    setState("playing");
    return seeded;             // use this immediately for the current click
  }

  function floodReveal(working, x, y) {
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= size || cy >= size) continue;
      const cell = working[cy][cx];
      if (cell.revealed || cell.flagged) continue;
      cell.revealed = true;
      if (!cell.mine && cell.count === 0) {
        for (const [nx, ny] of neighbors(size, cx, cy)) {
          if (!working[ny][nx].revealed) stack.push([nx, ny]);
        }
      }
    }
  }

  function reveal(x, y) {
    if (state === "won" || state === "lost") return;

    const working = ensureStarted(x, y).map(r => r.map(c => ({ ...c })));
    const cell = working[y][x];
    if (cell.flagged || cell.revealed) return;

    if (cell.mine) {
      cell.revealed = true;
      setBoard(working);
      setState("lost");
      clearInterval(timerRef.current);
      return;
    }

    floodReveal(working, x, y);
    setBoard(working);

    const newlyRevealed = working.flat().filter(c => c.revealed && !c.mine).length;
    if (newlyRevealed >= totalSafe) {
      setState("won");
      clearInterval(timerRef.current);
    }
  }

  // Click a revealed number to chord open neighbors if flags match the number
  function chord(x, y) {
    if (state !== "playing") return;
    const cell = board[y][x];
    if (!cell.revealed || cell.count === 0) return;

    const adj = neighbors(size, x, y);
    const flagCount = adj.filter(([nx, ny]) => board[ny][nx].flagged).length;
    if (flagCount !== cell.count) return;

    const working = board.map(r => r.map(c => ({ ...c })));
    for (const [nx, ny] of adj) {
      const c = working[ny][nx];
      if (!c.flagged && !c.revealed) {
        if (c.mine) {
          c.revealed = true;
          setBoard(working);
          setState("lost");
          clearInterval(timerRef.current);
          return;
        }
        floodReveal(working, nx, ny);
      }
    }
    setBoard(working);

    const newlyRevealed = working.flat().filter(c => c.revealed && !c.mine).length;
    if (newlyRevealed >= totalSafe) {
      setState("won");
      clearInterval(timerRef.current);
    }
  }

  function toggleFlag(x, y, e) {
    e.preventDefault();
    if (state === "won" || state === "lost") return;
    const working = board.map(r => r.map(c => ({ ...c })));
    const cell = working[y][x];
    if (cell.revealed) return;
    if (state === "ready") setState("playing"); // flags can start the game/timer
    cell.flagged = !cell.flagged;
    setBoard(working);
    setMinesLeft((m) => m + (cell.flagged ? -1 : 1));
  }

  function reset(newDiff = difficulty) {
    setDifficulty(newDiff);
    const { size: s, mines: m } = DIFFICULTIES[newDiff];
    setBoard(makeEmptyBoard(s));
    setMinesLeft(m);
    setState("ready");
    setSeconds(0);
    clearInterval(timerRef.current);
  }

  return (
    <div className="mines-root" onContextMenu={(e) => e.preventDefault()}>
      <div className="mines-topbar">
        <div className="group">
          <label className="label">Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) => reset(e.target.value)}
            className="select"
          >
            {Object.keys(DIFFICULTIES).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>

        <div className="stats">
          <div className="stat">⏱ <strong>{seconds.toString().padStart(3, "0")}</strong></div>
          <div className="stat">💣 <strong>{Math.max(0, minesLeft)}</strong></div>
          <div className="stat">✅ <strong>{revealedSafe}/{totalSafe}</strong></div>
        </div>

        <button className="btn" onClick={() => reset(difficulty)}>New Game</button>
      </div>

      <div
        className={`status-bar ${state}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {state === "ready"   && "Click any tile to begin — first click is always safe."}
        {state === "playing" && "Right-click to flag. Click a number to chord."}
        {state === "won"     && "🎉 You cleared the board!"}
        {state === "lost"    && "💥 Boom! Try again."}
      </div>

      <div
        className="board"
        style={{ "--size": size }}
        role="grid"
        aria-label={`Minesweeper ${size} by ${size}`}
      >
        {board.map((row, y) =>
          row.map((cell, x) => {
            const num = cell.revealed && !cell.mine ? (cell.count || "") : undefined;
            return (
              <button
                key={`${x}-${y}`}
                role="gridcell"
                aria-label={
                  cell.revealed
                    ? cell.mine
                      ? "Mine"
                      : `Revealed ${cell.count || "empty"}`
                    : cell.flagged
                    ? "Flagged"
                    : "Hidden"
                }
                className={[
                  "cell",
                  cell.revealed && "revealed",
                  cell.flagged && "flagged",
                  cell.mine && cell.revealed && "mine",
                  num && `n${num}`,
                ].filter(Boolean).join(" ")}
                onClick={() => (cell.revealed ? chord(x, y) : reveal(x, y))}
                onContextMenu={(e) => toggleFlag(x, y, e)}
              >
                {cell.revealed ? (cell.mine ? "💣" : num) : cell.flagged ? "🚩" : ""}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
