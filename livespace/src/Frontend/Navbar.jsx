// Navbar.jsx
import React, { useRef, useEffect, useState } from "react";

export default function Navbar({
  searchTerm,
  setSearchTerm,
  handleSearch,
  searchResults = [],
  setSearchResults // REQUIRED: Profile.jsx should pass setSearchResults
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  // Open dropdown whenever results appear
  useEffect(() => {
    setOpen(Array.isArray(searchResults) && searchResults.length > 0);
  }, [searchResults]);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        // If you prefer to hide but keep results, comment out next line
        if (typeof setSearchResults === "function") setSearchResults([]);
      }
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        if (typeof setSearchResults === "function") setSearchResults([]);
      }
    };

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [setSearchResults]);

  const onInputKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <nav
      style={{
        backgroundColor: "#122939",
        color: "#fff",
        padding: "10px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        position: "relative",
        zIndex: 10
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: "18px", color: "#27D496" }}>
        LiveSpaceZone
      </div>

      <div ref={rootRef} style={{ position: "relative", minWidth: 320 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search by name or email..."
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.08)",
              width: 300,
              outline: "none",
              background: "rgba(255,255,255,0.03)",
              color: "#fff"
            }}
          />
          <button
            onClick={handleSearch}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: "#27D496",
              color: "#052023",
              cursor: "pointer"
            }}
          >
            Search
          </button>
        </div>

        {/* Dropdown */}
        {open && searchResults && searchResults.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "44px",
              left: 0,
              right: 0,
              background: "#fff",
              color: "#000",
              borderRadius: "0 0 6px 6px",
              boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
              maxHeight: "320px",
              overflowY: "auto",
              zIndex: 2000
            }}
          >
            {searchResults.map((u) => (
              <div
                key={u.id}
                onClick={() => {
                  // default behaviour: when user clicks a result we close the dropdown and clear results
                  if (typeof setSearchResults === "function") setSearchResults([]);
                  setOpen(false);
                  // Optional: navigate to user's profile page if you have a route
                  // e.g. navigate(`/profile/${u.id}`)
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderBottom: "1px solid #eee",
                  cursor: "pointer"
                }}
              >
                <img
                  src={u.photo}
                  alt={`${u.firstName || ""} ${u.lastName || ""}`}
                  style={{ width: 36, height: 36, borderRadius: 18, objectFit: "cover" }}
                />
                <div style={{ lineHeight: 1 }}>
                  <div style={{ fontWeight: 600 }}>{(u.firstName || "") + " " + (u.lastName || "")}</div>
                  <div style={{ color: "#666", fontSize: 13 }}>{u.email}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
