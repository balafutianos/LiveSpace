// src/Frontend/Apps/ChessApp.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

const DEFAULT_SIZE = 520;

export default function ChessApp() {
  const [game, setGame] = useState(() => new Chess());
  const gameRef = useRef(null);
  const [boardWidth, setBoardWidth] = useState(DEFAULT_SIZE);

  const [mode, setMode] = useState("ai"); // "ai" | "human"
  const modeRef = useRef("ai");

  const [status, setStatus] = useState("White to move");
  const [waitingAi, setWaitingAi] = useState(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    const onResize = () => {
      const max = Math.min(window.innerWidth - 40, 640);
      setBoardWidth(Math.max(300, max));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const sideToMove = useMemo(() => (game.turn() === "w" ? "White" : "Black"), [game]);

  const refreshStatus = (g) => {
    if (g.isGameOver()) {
      if (g.isCheckmate()) {
        setStatus(`Checkmate — ${g.turn() === "w" ? "Black" : "White"} wins`);
      } else if (g.isStalemate()) {
        setStatus("Draw — stalemate");
      } else if (g.isThreefoldRepetition()) {
        setStatus("Draw — threefold repetition");
      } else if (g.isInsufficientMaterial()) {
        setStatus("Draw — insufficient material");
      } else if (g.isDraw()) {
        setStatus("Draw");
      } else {
        setStatus("Game over");
      }
    } else if (g.inCheck()) {
      setStatus(`${g.turn() === "w" ? "White" : "Black"} to move — check!`);
    } else {
      setStatus(`${g.turn() === "w" ? "White" : "Black"} to move`);
    }
  };

  // Basic AI: random legal move
  const aiMove = () => {
    const g = gameRef.current;
    if (!g || g.isGameOver()) return;
    const legal = g.moves({ verbose: true });
    if (!legal.length) return;

    const mv = legal[Math.floor(Math.random() * legal.length)];
    setGame((prev) => {
      const next = new Chess(prev.fen());
      next.move({ from: mv.from, to: mv.to, promotion: mv.promotion || "q" });
      return next;
    });
    setWaitingAi(false);
    refreshStatus(gameRef.current);
  };

  // Only set promotion when it’s actually a pawn reaching last rank
  const promotionFor = (g, from, to) => {
    const piece = g.get(from);
    if (!piece || piece.type !== "p") return undefined;
    const rank = to[1];
    if ((piece.color === "w" && rank === "8") || (piece.color === "b" && rank === "1")) {
      return "q";
    }
    return undefined;
  };

  const onDrop = (sourceSquare, targetSquare) => {
    // Try the move on a clone; NEVER let exceptions bubble up
    let moved = false;
    let after;
    try {
      const test = new Chess(game.fen());
      const moveObj = {
        from: sourceSquare,
        to: targetSquare,
        promotion: promotionFor(test, sourceSquare, targetSquare),
      };
      const res = test.move(moveObj);
      if (!res) return false; // illegal -> snap back

      moved = true;
      after = test.fen();
    } catch {
      return false; // illegal or malformed -> snap back
    }

    if (!moved) return false;

    // Commit the valid move
    setGame(new Chess(after));

    const g = new Chess(after);
    refreshStatus(g);

    // If vs AI and not over, make AI move shortly
    if (modeRef.current === "ai" && !g.isGameOver()) {
      setWaitingAi(true);
      setTimeout(aiMove, 350);
    }
    return true;
  };

  const resetGame = () => {
    setGame(new Chess());
    setWaitingAi(false);
    setStatus("White to move");
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>LiveSpace Chess</h2>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setWaitingAi(false);
            }}
            title="Game mode"
          >
            <option value="ai">Vs AI (random)</option>
            <option value="human">Local 2-player</option>
          </select>
          <button className="btn btn-primary" onClick={resetGame}>New game</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20 }}>
        <div>
          <Chessboard
            id="livespace-chess"
            position={game.fen()}
            onPieceDrop={onDrop}
            boardWidth={boardWidth}
            customBoardStyle={{
              borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,.35)",
            }}
            animationDuration={200}
            arePiecesDraggable={!waitingAi && !game.isGameOver()}
          />
          <div style={{ marginTop: 10, fontWeight: 600 }}>
            {status} {waitingAi ? "• AI is thinking…" : ""}
          </div>
        </div>

        <div>
          <div style={{
            background: "var(--panel-2, #0f172a)",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 12,
            padding: 12
          }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Moves (SAN)</div>
            <div style={{
              maxHeight: 360,
              overflow: "auto",
              lineHeight: 1.6,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            }}>
              {game.history().join(" ")}
            </div>
          </div>

          <div style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10
          }}>
            <button
              className="btn btn-ghost"
              onClick={() =>
                setGame((prev) => {
                  const next = new Chess(prev.fen());
                  if (next.history().length > 0) next.undo();
                  return next;
                })
              }
              disabled={game.history().length === 0 || waitingAi}
            >
              Undo
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                navigator.clipboard.writeText(game.pgn());
              }}
            >
              Copy PGN
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            Tip: In “Local 2-player” mode, sit side-by-side and take turns.
          </div>
        </div>
      </div>
    </div>
  );
}
