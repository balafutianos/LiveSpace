// App.jsx
import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { ToastContainer } from "react-toastify";
import { collection, getDocs, limit, query } from "firebase/firestore";

import { auth, db } from "./Frontend/firebase";   // adjust path if needed
import Navbar from "./Frontend/Navbar";

import Signup from "./Frontend/Signup";
import Login from "./Frontend/Login";
import Profile from "./Frontend/Profile";
import Messages from "./Frontend/Messages";

function AppShell({ uid }) {
  // --- Search state/logic passed to Navbar ---
  const [searchTerm, setSearchTerm] = React.useState("");
  const [searchResults, setSearchResults] = React.useState([]);

  const handleSearch = React.useCallback(async () => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      setSearchResults([]);
      return;
    }

    try {
      // Pull a small batch of users and filter client-side
      const q = query(collection(db, "Users"), limit(50));
      const snap = await getDocs(q);
      const results = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => {
          const fn = (u.firstName || "").toLowerCase();
          const ln = (u.lastName || "").toLowerCase();
          const em = (u.email || "").toLowerCase();
          const full = (fn + " " + ln).trim();
          return (
            fn.includes(term) ||
            ln.includes(term) ||
            full.includes(term) ||
            em.includes(term)
          );
        })
        .slice(0, 12);

      setSearchResults(results);
    } catch (e) {
      console.error("search error", e);
      setSearchResults([]);
    }
  }, [searchTerm]);

  // --- Hide navbar on signup/login ---
  const location = useLocation();
  const hideNavbar = ["/", "/login"].includes(location.pathname);

  return (
    <>
      {!hideNavbar && (
        <Navbar
          currentUserId={uid}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          handleSearch={handleSearch}
          searchResults={searchResults}
        />
      )}

      <Routes>
        <Route path="/" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:uid" element={<Profile />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/messages/:uid" element={<Messages />} />
      </Routes>
    </>
  );
}

export default function App() {
  const [uid, setUid] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u ? u.uid : null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  if (!ready) return null;

  return (
    <Router>
      <AppShell uid={uid} />
      <ToastContainer />
    </Router>
  );
}
