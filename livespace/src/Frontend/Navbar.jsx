// Navbar.jsx
import React from "react";

function Navbar({ searchTerm, setSearchTerm, handleSearch }) {
  return (
    <nav style={{
      backgroundColor: "#122939",
      color: "#27D496",
      padding: "10px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }}>
      <div style={{ fontWeight: "bold", fontSize: "18px" }}>LiveSpaceZone</div>
      <div>
        <input
          type="text"
          placeholder="Search People"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: "5px",
            borderRadius: "4px",
            border: "none",
            marginRight: "5px"
          }}
        />
        <button
          onClick={handleSearch}
          style={{
            padding: "6px 10px",
            borderRadius: "4px",
            border: "none",
            backgroundColor: "#555",
            color: "white"
          }}
        >
          Search
        </button>
      </div>
    </nav>
  );
}

export default Navbar;
