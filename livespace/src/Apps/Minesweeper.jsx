// src/Apps/MinesweeperApp.jsx
import React, { useState } from "react";
import "./Minesweeper.css";

const BOARD_SIZE = 8;
const MINES = 10;

function createBoard() {
  const board = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill({ mine: false, revealed: false, flagged: false, count: 0 })
  );

  // Place mines
  let placed = 0;
  while (placed < MINES) {
    const x = Math.floor(Math.random() * BOARD_SIZE);
    const y = Math.floor(Math.random() * BOARD_SIZE);
    if (!board[y][x].mine) {
      board[y][x] = { ...board[y][x], mine: true };
      placed++;
    }
  }

  // Count neighbors
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x].mine) continue;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue;
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < BOARD_SIZE && nx >= 0 && nx < BOARD_SIZE) {
            if (board[ny][nx].mine) count++;
          }
        }
      }
      board[y][x] = { ...board[y][x], count };
    }
  }

  return board;
}

export default function MinesweeperApp() {
  const [board, setBoard] = useState(createBoard());
  const [gameOver, setGameOver] = useState(false);

  function reveal(x, y) {
    if (gameOver || board[y][x].revealed || board[y][x].flagged) return;
    const newBoard = board.map(row => row.map(cell => ({ ...cell })));

    function dfs(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= BOARD_SIZE || cy >= BOARD_SIZE) return;
      const cell = newBoard[cy][cx];
      if (cell.revealed || cell.flagged) return;
      cell.revealed = true;
      if (cell.mine) {
        setGameOver(true);
        return;
      }
      if (cell.count === 0) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            dfs(cx + dx, cy + dy);
          }
        }
      }
    }

    dfs(x, y);
    setBoard(newBoard);
  }

  function toggleFlag(x, y, e) {
    e.preventDefault();
    if (gameOver || board[y][x].revealed) return;
    const newBoard = board.map(row => row.map(cell => ({ ...cell })));
    newBoard[y][x].flagged = !newBoard[y][x].flagged;
    setBoard(newBoard);
  }

  function reset() {
    setBoard(createBoard());
    setGameOver(false);
  }

  return (
    <div className="minesweeper">
      <h2>Minesweeper</h2>
      {gameOver && <div className="status">💥 Game Over</div>}
      <button onClick={reset}>Restart</button>
      <div className="board">
        {board.map((row, y) => (
          <div key={y} className="row">
            {row.map((cell, x) => (
              <div
                key={x}
                className={`cell ${cell.revealed ? "revealed" : ""} ${cell.flagged ? "flagged" : ""}`}
                onClick={() => reveal(x, y)}
                onContextMenu={(e) => toggleFlag(x, y, e)}
              >
                {cell.revealed
                  ? cell.mine
                    ? "💣"
                    : cell.count > 0
                    ? cell.count
                    : ""
                  : cell.flagged
                  ? "🚩"
                  : ""}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
