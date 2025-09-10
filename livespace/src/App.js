// App.jsx
import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { ToastContainer } from "react-toastify";
import { collection, getDocs, limit, query } from "firebase/firestore";

import { auth, db } from "./Frontend/firebase";
import Navbar from "./Frontend/Navbar";

import Signup from "./Frontend/Signup";
import Login from "./Frontend/Login";
import VerifyEmail from "./Frontend/VerifyEmail";
import Profile from "./Frontend/Profile";
import Messages from "./Frontend/Messages";

/* ---------- Guard: require signed-in + verified email ---------- */
function RequireVerified({ user, children }) {
  if (user === undefined) return null;            // still loading
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify" replace />;
  return children;
}

function AppShell({ user }) {
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

  // --- Hide navbar on signup/login/verify ---
  const location = useLocation();
  const hideNavbar = ["/", "/login", "/verify"].includes(location.pathname);

  return (
    <>
      {!hideNavbar && user && user.emailVerified && (
        <Navbar
          currentUserId={user.uid}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          handleSearch={handleSearch}
          searchResults={searchResults}
        />
      )}

      <Routes>
        {/* Public */}
        <Route path="/" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<VerifyEmail />} />

        {/* Protected (must be verified) */}
        <Route
          path="/profile"
          element={
            <RequireVerified user={user}>
              <Profile />
            </RequireVerified>
          }
        />
        <Route
          path="/profile/:uid"
          element={
            <RequireVerified user={user}>
              <Profile />
            </RequireVerified>
          }
        />
        <Route
          path="/messages"
          element={
            <RequireVerified user={user}>
              <Messages />
            </RequireVerified>
          }
        />
        <Route
          path="/messages/:uid"
          element={
            <RequireVerified user={user}>
              <Messages />
            </RequireVerified>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined=loading
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null));
    return () => unsub();
  }, []);

  if (user === undefined) return null;

  return (
    <Router>
      <AppShell user={user} />
      <ToastContainer />
    </Router>
  );
}
