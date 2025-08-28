// EmojiKeyboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import EMOJI_DATA, { CATEGORIES, TONEABLE, SKIN_TONES, toneApply, normalizeString, EMOTICON_MAP } from "./emojiData";

const LS_RECENTS_KEY = "ls_recent_emoji_v1";

export default function EmojiKeyboard({
  onPick,              // (emoji:string) => void
  onClose = () => {},  // () => void
  anchor = "bottom-right", // bottom-right | bottom-left | top-right | top-left
  maxPerRow = 8,
}) {
  const [tab, setTab] = useState("Recent");
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState("default"); // "default" | "1".."5"
  const [recents, setRecents] = useState([]);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    // Load recents
    try {
      const raw = localStorage.getItem(LS_RECENTS_KEY);
      setRecents(raw ? JSON.parse(raw) : []);
    } catch { setRecents([]); }

    // Focus search on open
    requestAnimationFrame(() => searchRef.current?.focus());

    // Close on outside click/Escape
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    };
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  function recordRecent(emoji) {
    try {
      setRecents((prev) => {
        const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 24);
        localStorage.setItem(LS_RECENTS_KEY, JSON.stringify(next));
        return next;
      });
    } catch {}
  }

  function handlePick(emoji) {
    recordRecent(emoji);
    onPick?.(emoji);
  }

  const filtered = useMemo(() => {
    const q = normalizeString(query.trim());
    if (!q) return null;

    // 1) direct emoticon mapping (":)", ":P", etc.)
    const emoticonHit = EMOTICON_MAP[q];
    // 2) name/alias/synonym search
    const results = [];
    for (const e of EMOJI_DATA) {
      const hay = e._search;
      if (hay.includes(q)) results.push(e);
    }
    if (emoticonHit && !results.some((r) => r.char === emoticonHit)) {
      const special = EMOJI_DATA.find((e) => e.char === emoticonHit);
      if (special) results.unshift(special);
    }
    return results;
  }, [query]);

  const grid = useMemo(() => {
    // Build grid for current tab
    if (filtered) return filtered;

    if (tab === "Recent") {
      const list = recents
        .map((c) => EMOJI_DATA.find((e) => e.char === c))
        .filter(Boolean);
      return list;
    }
    return EMOJI_DATA.filter((e) => e.category === tab);
  }, [filtered, tab, recents]);

  function renderToneRow() {
    return (
      <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
        <ToneDot label="Default" on={tone === "default"} onClick={() => setTone("default")} />
        {SKIN_TONES.map((t) => (
          <ToneDot key={t.id} label={t.label} on={tone === t.id} onClick={() => setTone(t.id)} swatch={t.swatch} />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        ...(anchor.includes("bottom") ? { bottom: "44px" } : { top: "44px" }),
        ...(anchor.includes("right") ? { right: 0 } : { left: 0 }),
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 12,
        boxShadow: "0 14px 40px rgba(0,0,0,.18)",
        width: maxPerRow * 42 + 24, // grid width + paddings
        zIndex: 9999,
        userSelect: "none",
      }}
    >
      {/* Header: Tabs + Search + Tone */}
      <div style={{ padding: 10, borderBottom: "1px solid #eee" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Tabs value={tab} onChange={setTab} />
          {renderToneRow()}
        </div>
        <div style={{ marginTop: 8 }}>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji or type emoticons like :)"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          padding: 8,
          maxHeight: 320,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: `repeat(${maxPerRow}, 1fr)`,
          gap: 6,
        }}
      >
        {grid.length === 0 && (
          <div style={{ padding: 10, color: "#777", gridColumn: `span ${maxPerRow}` }}>
            {filtered ? "No results" : "No recent emoji"}
          </div>
        )}
        {grid.map((e) => {
          const show = TONEABLE.has(e.char) && tone !== "default" ? toneApply(e.char, tone) : e.char;
          return (
            <button
              key={`${e.char}-${e.name}`}
              onClick={() => handlePick(show)}
              title={e.name}
              style={{
                fontSize: 22,
                lineHeight: "32px",
                width: 36,
                height: 36,
                borderRadius: 8,
                border: "1px solid #eee",
                background: "#fff",
                cursor: "pointer",
              }}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = "#f7f9fb"; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = "#fff"; }}
            >
              {show}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Tabs({ value, onChange }) {
  const tabs = ["Recent", ...CATEGORIES];
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            borderRadius: 20,
            padding: "6px 10px",
            border: "1px solid #e5e7eb",
            background: value === t ? "#122939" : "#fff",
            color: value === t ? "#fff" : "#122939",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 12,
          }}
          title={t}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function ToneDot({ on, onClick, label, swatch }) {
  return (
    <button
      onClick={onClick}
      title={`Skin tone: ${label}`}
      style={{
        width: 22, height: 22, borderRadius: 999,
        border: on ? "2px solid #122939" : "1px solid #ccc",
        background: swatch || "linear-gradient(135deg, #f7f7f7, #eee)",
        cursor: "pointer",
      }}
    />
  );
}
