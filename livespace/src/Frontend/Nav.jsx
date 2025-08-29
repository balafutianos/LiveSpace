import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";
import { toast } from "react-toastify";
import "./Signup.css";

function Nav() {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Field & general errors
  const [errors, setErrors] = useState({
    email: "",
    password: "",
    general: "",
  });

  const getFriendlyMessage = (code) => {
    switch (code) {
      case "auth/invalid-email":
        return { email: "Please enter a valid email address." };
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential": // new consolidated error from Firebase
        return { general: "Email or password is incorrect." };
      case "auth/too-many-requests":
        return {
          general:
            "Too many attempts. Please try again later or reset your password.",
        };
      case "auth/network-request-failed":
        return { general: "Network error. Check your connection and try again." };
      default:
        return { general: "Something went wrong. Please try again." };
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    // Clear previous errors
    setErrors({ email: "", password: "", general: "" });

    // Basic client validation (optional, quick UX wins)
    const nextErrors = {};
    if (!loginEmail) nextErrors.email = "Email is required.";
    if (!loginPassword) nextErrors.password = "Password is required.";
    if (Object.keys(nextErrors).length) {
      setErrors((prev) => ({ ...prev, ...nextErrors }));
      return;
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      toast.success("User logged in successfully", { position: "top-center" });
      window.location.href = "/profile";
    } catch (error) {
      // Map Firebase error code to friendly message(s)
      const friendly = getFriendlyMessage(error.code);
      setErrors((prev) => ({ ...prev, ...friendly }));

      // Toast as a non-blocking fallback
      toast.error(
        friendly.general || friendly.email || friendly.password || "Login failed",
        { position: "bottom-center" }
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <h1 className="brand-logo">Livespace</h1>

        <form className="login-form" onSubmit={handleLogin} noValidate>
          {/* General error (aria-live for screen readers) */}
          {errors.general && (
            <div className="form-error" role="alert" aria-live="polite">
              {errors.general}
            </div>
          )}

          <div className="input-wrap">
            <input
              type="email"
              placeholder="Email address"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
              className={errors.email ? "is-error" : ""}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "login-email-error" : undefined}
            />
            {errors.email && (
              <small id="login-email-error" className="field-error">
                {errors.email}
              </small>
            )}
          </div>

          <div className="input-wrap">
            <input
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              className={errors.password ? "is-error" : ""}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? "login-password-error" : undefined
              }
            />
            {errors.password && (
              <small id="login-password-error" className="field-error">
                {errors.password}
              </small>
            )}
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Logging in…" : "Log In"}
          </button>
        </form>
      </div>
    </nav>
  );
}

export default Nav;
