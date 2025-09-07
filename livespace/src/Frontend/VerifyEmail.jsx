import React, { useEffect, useState } from "react";
import { auth } from "./firebase";
import { sendEmailVerification, onAuthStateChanged } from "firebase/auth";
import { toast } from "react-toastify";

export default function VerifyEmail() {
  const [user, setUser] = useState(() => auth.currentUser);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Poll for verification every 2.5s; if done, go to /profile
  useEffect(() => {
    if (!user) return;
    const id = setInterval(async () => {
      try {
        await user.reload();
        if (auth.currentUser?.emailVerified) {
          clearInterval(id);
          toast.success("Email verified! Redirecting…");
          window.location.href = "/profile";
        }
      } catch {}
    }, 2500);
    return () => clearInterval(id);
  }, [user]);

  const resend = async () => {
    if (!user) {
      toast.error("Please sign in again, then press Resend.");
      return;
    }
    try {
      setSending(true);
      await user.reload();
      await sendEmailVerification(user);
      toast.success(`Verification email re-sent to ${user.email}`);
    } catch (e) {
      if (e?.code === "auth/too-many-requests") {
        toast.error("Too many attempts. Please try again later.");
      } else {
        toast.error("Couldn't resend right now. Try again shortly.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="verify-shell">
      <h1>Verify your email</h1>
      <p>
        We sent a verification link to <strong>{user?.email || "your email"}</strong>.
        Open that email and click the link.
      </p>
      <button onClick={resend} disabled={sending || !user}>
        {sending ? "Sending…" : "Resend verification email"}
      </button>
      
    </div>
  );
}
