import React, { useEffect, useState } from "react";
import { auth } from "./firebase";
import { sendEmailVerification, onAuthStateChanged } from "firebase/auth";
import { toast } from "react-toastify";

export default function VerifyEmail() {
  const [user, setUser] = useState(() => auth.currentUser);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0); // seconds

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Poll for verification every 2.5s; if done, go to /profile
  useEffect(() => {
    if (!user) return;
    const id = setInterval(async () => {
      try {
        await auth.currentUser?.reload();
        if (auth.currentUser?.emailVerified) {
          clearInterval(id);
          toast.success("Email verified! Redirecting…");
          window.location.href = "/profile";
        }
      } catch {
        // ignore
      }
    }, 2500);
    return () => clearInterval(id);
  }, [user]);

  // Cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const resend = async () => {
    const u = auth.currentUser;
    if (!u) {
      toast.error("You’re signed out. Please sign in, then press Resend.");
      return;
    }
    try {
      setSending(true);

      // Make sure we have the freshest state
      await u.reload();
      if (u.emailVerified) {
        toast.success("Already verified — redirecting…");
        window.location.href = "/profile";
        return;
      }

      // Optional but recommended: ensure the return URL is authorized in Firebase Console
      const actionCodeSettings = {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      };

      await sendEmailVerification(u, actionCodeSettings);
      toast.success(`Verification email sent to ${u.email}`);
      setCooldown(60); // basic anti-spam throttle
    } catch (e) {
      // Show meaningful errors
      const code = e?.code || "";
      if (code === "auth/too-many-requests") {
        toast.error("Too many attempts. Please wait a bit and try again.");
        setCooldown(Math.max(cooldown, 60));
      } else if (code === "auth/missing-recaptcha-token" || code === "auth/invalid-recaptcha-token") {
        toast.error("Please complete the security check and try again.");
      } else if (
        code === "auth/user-token-expired" ||
        code === "auth/user-disabled" ||
        code === "auth/user-not-found"
      ) {
        toast.error("Session expired. Sign out and back in, then try again.");
      } else if (code === "auth/missing-email") {
        toast.error("This account has no email address.");
      } else {
        console.error(e);
        toast.error(e?.message || "Couldn't resend right now. Try again shortly.");
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
      <button onClick={resend} disabled={sending || !user || cooldown > 0}>
        {sending ? "Sending…" : cooldown > 0 ? `Resend (${cooldown})` : "Resend verification email"}
      </button>
    </div>
  );
}
