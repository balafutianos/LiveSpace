// src/Frontend/AppCenter.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase";
import "./AppCenter.css";

const FALLBACK_ICON = "https://i.imgur.com/0y8Ftya.png";
const FALLBACK_COVER = "https://i.imgur.com/4N3t4Yw.jpeg";

/**
 * Firestore model (either "Games" or "Apps"—this file reads "Games")
 * Games/{gameId}:
 *  { title, description, iconUrl, coverUrl, gameUrl, categories:[...],
 *    visibility:'public'|'private', createdBy, createdAt, plays:number }
 *
 * AppFavorites/{id}: { userId, gameId, createdAt }
 * GamePlays/{id}:    { userId, gameId, startedAt, endedAt }
 */

const CHESS_APP = {
  // synthetic local app; no Firestore id
  __local: true,
  id: "__chess_local",
  title: "Chess",
  description: "Play vs AI or challenge your Livespace friends. Tracks your wins.",
  iconUrl: "https://images.chesscomfiles.com/chess-themes/pieces/alpha/150/wk.png",
  coverUrl:
    "https://images.unsplash.com/photo-1546538914-bf8364f71a5d?q=80&w=2069&auto=format&fit=crop",
  gameUrl: "/apps/chess", // internal route
  categories: ["board", "strategy", "multiplayer"],
  visibility: "public",
  plays: 0,
};
const MINESWEEPER_APP = {
  __local: true,
  id: "__minesweeper_local",
  title: "Minesweeper",
  description: "Classic puzzle: clear the field without hitting a mine.",
  iconUrl: "https://img.icons8.com/emoji/96/bomb-emoji.png",
  coverUrl: "https://i.imgur.com/cqjlQkH.jpeg",
  gameUrl: "/apps/minesweeper",
  categories: ["puzzle", "classic", "singleplayer"],
  visibility: "public",
  plays: 0,
};

/* ---------- tiny helpers ---------- */
const uniq = (arr) => Array.from(new Set(arr || []));
function safeMillis(ts) {
  if (!ts) return 0;
  // parenthesized to appease ESLint precedence rule
  return ts.toMillis ? ts.toMillis() : (ts.seconds ? ts.seconds * 1000 : 0);
}

function useFavorites(uid) {
  const [favIds, setFavIds] = useState(new Set());
  useEffect(() => {
    if (!uid) return;
    const qy = query(collection(db, "AppFavorites"), where("userId", "==", uid));
    const unsub = onSnapshot(qy, (snap) => {
      setFavIds(new Set(snap.docs.map((d) => d.data().gameId)));
    });
    return unsub;
  }, [uid]);
  return favIds;
}

export default function AppCenter() {
  const uid = auth.currentUser?.uid || null;
  const nav = useNavigate();

  // UI state
  const [gamesFS, setGamesFS] = useState([]); // from Firestore
  const [loading, setLoading] = useState(true);

  const [qText, setQText] = useState("");
  const [activeCats, setActiveCats] = useState([]);
  const [sort, setSort] = useState("popular"); // 'popular' | 'recent' | 'title'

  // Modal for web/iframe games (not used for internal apps)
  const [openGame, setOpenGame] = useState(null);
  const [playId, setPlayId] = useState(null);
  const [launching, setLaunching] = useState(false);

  const favIds = useFavorites(uid);

  /* --------- load public games from Firestore --------- */
  useEffect(() => {
    const qy = query(
      collection(db, "Games"),
      where("visibility", "==", "public"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setGamesFS(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  /* --------- merge in Chess (dedupe if present in FS) --------- */
 const games = useMemo(() => {
  const hasChess = gamesFS.some(g => g.gameUrl?.trim().toLowerCase() === "/apps/chess");
  const hasMines = gamesFS.some(g => g.gameUrl?.trim().toLowerCase() === "/apps/minesweeper");

  let base = [...gamesFS];
  if (!hasChess) base.unshift(CHESS_APP);
  if (!hasMines) base.unshift(MINESWEEPER_APP);
  return base;
}, [gamesFS]);

  /* --------- categories from games --------- */
  const allCategories = useMemo(() => {
    return uniq(
      games.flatMap((g) => (Array.isArray(g.categories) ? g.categories : []))
    ).sort((a, b) => a.localeCompare(b));
  }, [games]);

  /* --------- filter + sort --------- */
  const filtered = useMemo(() => {
    let list = games;
    const t = qText.trim().toLowerCase();
    if (t) {
      list = list.filter((g) => {
        const name = (g.title || "").toLowerCase();
        const desc = (g.description || "").toLowerCase();
        return name.includes(t) || desc.includes(t);
      });
    }
    if (activeCats.length > 0) {
      list = list.filter((g) =>
        (g.categories || []).some((c) => activeCats.includes(c))
      );
    }
    if (sort === "popular") {
      list = [...list].sort(
        (a, b) =>
          (b.plays || 0) - (a.plays || 0) || a.title.localeCompare(b.title)
      );
    } else if (sort === "recent") {
      list = [...list].sort(
        (a, b) => safeMillis(b.createdAt) - safeMillis(a.createdAt)
      );
    } else if (sort === "title") {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [games, qText, activeCats, sort]);

  /* --------- favorites toggle --------- */
  const toggleFavorite = async (gameId) => {
    if (!uid) return;
    try {
      const qy = query(
        collection(db, "AppFavorites"),
        where("userId", "==", uid),
        where("gameId", "==", gameId)
      );
      const snap = await getDocs(qy);
      if (!snap.empty) {
        await Promise.all(
          snap.docs.map((d) => deleteDoc(doc(db, "AppFavorites", d.id)))
        );
      } else {
        await addDoc(collection(db, "AppFavorites"), {
          userId: uid,
          gameId,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("toggleFavorite error:", e);
    }
  };

  /* --------- launch game --------- */
  const launchGame = async (game) => {
    if (!game) return;

    // If internal Livespace app (route), navigate instead of iframe modal
    if (typeof game.gameUrl === "string" && game.gameUrl.startsWith("/")) {
      // Basic play tracking (optional)
      if (uid && !game.__local) {
        try {
          await addDoc(collection(db, "GamePlays"), {
            userId: uid,
            gameId: game.id,
            startedAt: serverTimestamp(),
            endedAt: serverTimestamp(),
          });
        } catch {}
      }
      nav(game.gameUrl);
      return;
    }

    // Otherwise open modal with iframe
    setOpenGame(game);

    if (!uid) return; // guests can view, but skip analytics
    try {
      setLaunching(true);
      const playRef = await addDoc(collection(db, "GamePlays"), {
        userId: uid,
        gameId: game.id,
        startedAt: serverTimestamp(),
        endedAt: null,
      });
      setPlayId(playRef.id);
    } finally {
      setLaunching(false);
    }
  };

  /* --------- close modal (mark endedAt) --------- */
  const closeModal = async () => {
    setOpenGame(null);
    if (playId && uid) {
      try {
        await updateDoc(doc(db, "GamePlays", playId), {
          endedAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn("end play error:", e);
      }
    }
    setPlayId(null);
  };

  const catActive = (c) => activeCats.includes(c);
  const toggleCat = (c) =>
    setActiveCats((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );

  // (Optional) helper: seed Chess to Firestore; call from console if you want:
  //   window.__seedChess && window.__seedChess()
  useEffect(() => {
    window.__seedChess = async () => {
      try {
        const ref = await addDoc(collection(db, "Games"), {
          title: CHESS_APP.title,
          description: CHESS_APP.description,
          iconUrl: CHESS_APP.iconUrl,
          coverUrl: CHESS_APP.coverUrl,
          gameUrl: CHESS_APP.gameUrl,
          categories: CHESS_APP.categories,
          visibility: "public",
          createdBy: uid || "system",
          createdAt: serverTimestamp(),
          plays: 0,
        });
        console.log("Seeded Chess as Games/", ref.id);
      } catch (e) {
        console.error("Seed chess failed:", e);
      }
    };
    return () => {
      try {
        delete window.__seedChess;
      } catch {}
    };
  }, [uid]);

  return (
    <div className="appc-page">
      <div className="appc-toolbar">
        <div className="appc-search">
          <input
            placeholder="Search games…"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
          />
        </div>

        <div className="appc-sort">
          <label>Sort:</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="popular">Most played</option>
            <option value="recent">Newest</option>
            <option value="title">A–Z</option>
          </select>
        </div>
      </div>

      {allCategories.length > 0 && (
        <div className="appc-cats">
          {allCategories.map((c) => (
            <button
              key={c}
              className={`appc-cat ${catActive(c) ? "on" : ""}`}
              onClick={() => toggleCat(c)}
            >
              {c}
            </button>
          ))}
          {activeCats.length > 0 && (
            <button
              className="appc-cat clear"
              onClick={() => setActiveCats([])}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {loading && <div className="appc-empty">Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div className="appc-empty">No apps found.</div>
      )}

      <div className="appc-grid">
        {filtered.map((g) => {
          const fav = favIds.has(g.id);
          const isInternal =
            typeof g.gameUrl === "string" && g.gameUrl.startsWith("/");
          return (
            <div key={g.id} className="appc-card">
              <div className="appc-cover">
                <img src={g.coverUrl || FALLBACK_COVER} alt={g.title} />
                {/* Only show fav toggle when we have a stable id */}
                {g.id && !g.__local && (
                  <button
                    className={`appc-fav ${fav ? "on" : ""}`}
                    title={fav ? "Remove from favorites" : "Add to favorites"}
                    onClick={() => toggleFavorite(g.id)}
                  >
                    {fav ? "★" : "☆"}
                  </button>
                )}
              </div>

              <div className="appc-body">
                <div className="appc-row">
                  <img
                    className="appc-icon"
                    src={g.iconUrl || FALLBACK_ICON}
                    alt=""
                  />
                  <div className="appc-meta">
                    <div className="appc-title">{g.title}</div>
                    <div className="appc-sub">
                      {(g.categories || []).slice(0, 3).join(" • ")}
                    </div>
                  </div>
                </div>

                {g.description && (
                  <div className="appc-desc">{g.description}</div>
                )}

                <div className="appc-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => launchGame(g)}
                    disabled={launching && openGame?.id === g.id}
                  >
                    {isInternal
                      ? "Open"
                      : launching && openGame?.id === g.id
                      ? "Launching…"
                      : "Play"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal for web games only */}
      {openGame && !openGame.gameUrl?.startsWith("/") && (
        <div className="appc-modal" role="dialog" aria-modal="true">
          <div className="appc-modal-card">
            <div className="appc-modal-head">
              <div className="appc-modal-title">{openGame.title}</div>
              <button className="appc-close" onClick={closeModal}>
                ✕
              </button>
            </div>
            <div className="appc-modal-body">
              <iframe
                src={openGame.gameUrl}
                title={openGame.title}
                allow="autoplay; fullscreen"
                loading="lazy"
              />
            </div>
          </div>
          <div className="appc-modal-backdrop" onClick={closeModal} />
        </div>
      )}
    </div>
  );
}
