// App.jsx
import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { ToastContainer } from "react-toastify";

import { auth } from "./Frontend/firebase";   // adjust path if needed
import Navbar from "./Frontend/Navbar";

import Signup from "./Frontend/Signup";
import Login from "./Frontend/Login";
import Profile from "./Frontend/Profile";
import Messages from "./Frontend/Messages";

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
      {/* Navbar is always present → live requests/notifications everywhere */}
      <Navbar currentUserId={uid} />

      <Routes>
        <Route path="/" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:uid" element={<Profile />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/messages/:uid" element={<Messages />} />
      </Routes>

      <ToastContainer />
    </Router>
  );
}
