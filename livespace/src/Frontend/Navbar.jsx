// Navbar.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function Navbar({
  searchTerm = "",
  setSearchTerm = () => {},
  handleSearch = () => {},
  searchResults = []
}) {
  const navigate = useNavigate();

  return (
    <nav
      style={{
        backgroundColor: "#122939",
        color: "#fff",
        padding: "10px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative"
      }}
    >
      <div
        style={{
          fontWeight: "bold",
          fontSize: "18px",
          color: "#27D496",
          marginBottom: 10
        }}
      >
        LiveSpaceZone
      </div>

      {/* Search bar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          position: "relative",
          width: "100%",
          maxWidth: 400
        }}
      >
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          placeholder="Search by name or email..."
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.1)",
            width: "100%",
            outline: "none"
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

        {/* Results dropdown */}
        {searchResults.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "40px",
              left: 0,
              right: 0,
              background: "#fff",
              color: "#000",
              borderRadius: "0 0 6px 6px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              maxHeight: "220px",
              overflowY: "auto",
              zIndex: 1000
            }}
          >
            {searchResults.map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px",
                  cursor: "pointer",
                  borderBottom: "1px solid #eee"
                }}
                onClick={() => {
                  navigate(`/profile/${u.id}`);
                }}
              >
                <img
                  src={u.photo || "https://i.imgur.com/qzsiOuh.png"}
                  alt="user"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    objectFit: "cover"
                  }}
                />
                <div>
                  <div style={{ fontWeight: "600", fontSize: 14 }}>
                    {u.firstName} {u.lastName}
                  </div>
                  <div style={{ color: "#666", fontSize: 12 }}>{u.email}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
