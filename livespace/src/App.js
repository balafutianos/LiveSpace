// App.js
import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { ToastContainer, toast } from "react-toastify";
import { collection, getDocs, limit, query } from "firebase/firestore";

import { auth, db } from "./Frontend/firebase";
import Navbar from "./Frontend/Navbar";
import OnlineFriendSidebar from "./Frontend/OnlineFriendSidebar";
import { usePresence } from "./Frontend/presence";
import { ChatDockProvider } from "./Frontend/ChatDockContext";
import ChatDock from "./Frontend/ChatDock";
import FeedSidebar from "./Frontend/FeedSidebar";
import Photos from "./Frontend/Photos";
import Feed from "./Frontend/Feed";
import Signup from "./Frontend/Signup";
import Login from "./Frontend/Login";
import VerifyEmail from "./Frontend/VerifyEmail";
import Profile from "./Frontend/Profile";
import Messages from "./Frontend/Messages";
import FriendRequests from "./Frontend/FriendRequests";
import ChessApp from "./Apps/ChessApp";
import MinesweeperApp from "./Apps/Minesweeper";
import Events from "./Frontend/Events";
import "react-toastify/dist/ReactToastify.css";
import AppCenter from "./Frontend/AppCenter";
/* ---------- Guard: require signed-in + verified email ---------- */
function RequireVerified({ user, children }) {
  if (user === undefined) return null; // still loading
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify" replace />;
  return children;
}

/* ---------- Layout used by all authenticated pages ---------- */
function AuthedLayout({ user }) {
  usePresence(user?.uid || null);

  // Search state/logic for Navbar
  const [searchTerm, setSearchTerm] = React.useState("");
  const [searchResults, setSearchResults] = React.useState([]);

  const handleSearch = React.useCallback(async () => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return setSearchResults([]);

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

  return (
    <ChatDockProvider>
      {/* Fixed navbar (CSS does the fixing). We add a spacer below it. */}
      <Navbar
        currentUserId={user.uid}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        handleSearch={handleSearch}
        searchResults={searchResults}
      />
      {/* Spacer equal to navbar height so content starts below it */}
      <div style={{ height: 56 }} />

      {/* Main 3-column layout under the fixed navbar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "240px 1fr 280px",
          minHeight: "calc(100vh - 56px)",
        }}
      >
        <FeedSidebar currentUserId={user.uid} />

        <main style={{ overflow: "auto" }}>
          <Outlet />
        </main>

        <OnlineFriendSidebar />
      </div>

      {/* Floating chat dock anchored bottom-right */}
      <ChatDock currentUserId={user.uid} />
    </ChatDockProvider>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null));
    return () => unsub();
  }, []);

  // 🔒 Fail-safe: dismiss every toast 5s after it’s added
  useEffect(() => {
    const unsub = toast.onChange((payload) => {
      if (payload.status === "added") {
        const id = payload.id;
        setTimeout(() => toast.dismiss(id), 5000);
      }
    });
    return () => unsub();
  }, []);

  if (user === undefined) return null;

  return (
    <Router>
      <Routes>
        {/* Public routes (default = Signup) */}
        <Route path="/" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<VerifyEmail />} />

        {/* Authenticated section */}
        <Route
          element={
            <RequireVerified user={user}>
              <AuthedLayout user={user} />
            </RequireVerified>
          }
        >
          <Route path="/feed" element={<Feed />} />
          <Route path="/photos" element={<Photos />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:uid" element={<Profile />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:uid" element={<Messages />} />
          <Route path="/friendrequests" element={<FriendRequests />} />
          <Route path="/events" element={<Events />} />
          <Route path="/apps" element={<AppCenter />} />
          <Route path="/apps/chess" element={<ChessApp />} />
          <Route path="/apps/minesweeper" element={<MinesweeperApp />} />

        </Route>

        {/* Fallback */}
        <Route path="*"
          element={<Navigate to={user ? "/feed" : "/"} replace />}
        />
      </Routes>

      <ToastContainer
        position="top-center"
        autoClose={5000}
        newestOnTop
        closeOnClick
        draggable
        pauseOnHover
        pauseOnFocusLoss={false}
        style={{ zIndex: 2147483647 }}
        toastStyle={{ pointerEvents: "auto" }}
      />
    </Router>
  );
}
