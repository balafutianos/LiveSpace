import React from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import OnlineFriendSidebar from "./OnlineFriendSidebar";
import { usePresence } from "./presence";
import { auth } from "./firebase";

export default function AuthedLayout() {
  // publish my heartbeat while I’m logged in
  usePresence(auth.currentUser?.uid || null);

  return (
    <div style={{ display: "grid", gridTemplateRows: "56px 1fr", height: "100vh" }}>
      <Navbar />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", height: "100%" }}>
        <main style={{ overflow: "auto" }}>
          <Outlet />
        </main>
        <OnlineFriendSidebar />
      </div>
    </div>
  );
}
