import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { auth } from "./Frontend/firebase";
import Signup from "./Frontend/Signup";
import Login from "./Frontend/Login";
import VerifyEmail from "./Frontend/VerifyEmail";
import Profile from "./Frontend/Profile";
import Navbar from "./Frontend/Navbar"; // your logged-in navbar

function RequireVerified({ user, children }) {
  if (user === undefined) return null;        // still loading auth
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify" replace />;
  return children;
}

function AppShell({ user }) {
  const location = useLocation();
  // Hide the logged-in navbar on pages where it doesn't make sense
  const hideNavbar = ["/", "/login", "/verify"].includes(location.pathname);
  const canShowNavbar = !!user && user.emailVerified && !hideNavbar;

  return (
    <>
      {canShowNavbar && <Navbar currentUserId={user.uid} />}

      <Routes>
        <Route path="/" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<VerifyEmail />} />

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

        {/* fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading; null = signed out

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
