import React, { useState, useRef } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "./firebase";
import { toast } from "react-toastify";
import { Eye, EyeOff } from "lucide-react";
import "./Signup.css";

function Nav() {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef(null);

  const [errors, setErrors] = useState({ email: "", password: "", general: "" });

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrors({ email: "", password: "", general: "" });

    const next = {};
    if (!loginEmail.trim()) next.email = "Email is required.";
    if (!loginPassword) next.password = "Password is required.";
    if (Object.keys(next).length) {
      setErrors((p) => ({ ...p, ...next }));
      if (next.email && emailRef.current) emailRef.current.focus();
      return;
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      toast.success("User logged in successfully", { position: "top-center" });
      window.location.href = "/profile";
    } catch (error) {
      toast.error("Login failed", { position: "bottom-center" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!loginEmail.trim()) {
      setErrors((p) => ({ ...p, email: "Please enter your email address first." }));
      if (emailRef.current) emailRef.current.focus();
      return;
    }
    try {
      await sendPasswordResetEmail(auth, loginEmail.trim());
      toast.info("Password reset email sent. Please check your inbox.");
    } catch (error) {
      toast.error("Could not send reset email. Try again.");
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <h1 className="brand-logo">Livespace</h1>

        <form className="login-form" onSubmit={handleLogin} noValidate>
          {errors.general && (
            <div className="form-error" role="alert" aria-live="polite">
              {errors.general}
            </div>
          )}

          <div className="input-wrap">
            <input
              ref={emailRef}
              type="email"
              placeholder="Email address"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
              className={errors.email ? "is-error" : ""}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "login-email-error" : undefined}
              autoComplete="email"
              inputMode="email"
            />
            {errors.email && (
              <small id="login-email-error" className="field-error">
                {errors.email}
              </small>
            )}
          </div>

          <div className="input-wrap password-wrap">
            <div className="control">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                className={`input ${errors.password ? "is-error" : ""}`}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "login-password-error" : undefined}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {errors.password && (
              <small id="login-password-error" className="field-error">
                {errors.password}
              </small>
            )}
          </div>

          <button type="submit" className="login-button" disabled={loading} aria-busy={loading}>
            {loading ? "Logging in…" : "Log In"}
          </button>
        </form>

        {/* Anchor outside the form */}
        <a href="#" className="forgot-password" onClick={handleForgotPassword}>
          Forgot Password?
        </a>
      </div>
    </nav>
  );
}

export default Nav;  // <-- default export
