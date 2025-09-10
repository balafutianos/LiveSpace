import React, { useState } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { auth, db } from "./firebase";
import { setDoc, doc } from "firebase/firestore";
import { toast } from "react-toastify";
import "./Signup.css";
import Nav from "./Nav";
import { Eye, EyeOff } from "lucide-react"
function Signup() {
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");       // NEW
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);     // NEW
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({
    fname: "",
    lname: "",
    email: "",
    confirmEmail: "",  // NEW
    password: "",
    general: "",
  });

  // Password rules: >=8, 1 uppercase, 1 number, 1 special char
  const passwordIssue = (pw) => {
    if (pw.length < 8) return "Password must be at least 8 characters long.";
    if (!/[A-Z]/.test(pw)) return "Include at least one uppercase letter.";
    if (!/\d/.test(pw)) return "Include at least one number.";
    if (!/[^A-Za-z0-9]/.test(pw)) return "Include at least one special character.";
    return "";
  };

  const mapFirebaseError = (code) => {
    switch (code) {
      case "auth/email-already-in-use":
        return { email: "An account with this email already exists. Try logging in." };
      case "auth/invalid-email":
        return { email: "Please enter a valid email address." };
      case "auth/weak-password":
        return { password: "That password is too weak. Try a stronger one." };
      case "auth/network-request-failed":
        return { general: "Network error. Check your connection and try again." };
      case "auth/operation-not-allowed":
        return { general: "Email/password sign-up is disabled for this project." };
      default:
        return { general: "Something went wrong. Please try again." };
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    const issues = {};
    if (!email.trim()) issues.email = "Email is required.";
    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      issues.confirmEmail = "Emails do not match.";
    }
    const pwIssue = passwordIssue(password);
    if (pwIssue) issues.password = pwIssue;

    if (Object.keys(issues).length) {
      Object.values(issues).forEach((m) => toast.error(m));
      return;
    }

    try {
      setLoading(true);
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = cred.user;
const display = (user.displayName || "").trim();
const [first, ...rest] = display ? display.split(" ") : [email.split("@")[0]];
const firstName = (typeof fname === "string" && fname.trim()) || (first || "User");
const lastName  = (typeof lname === "string" && lname.trim()) || (rest.join(" ") || "")
await setDoc(doc(db, "Users", user.uid), {
  email: user.email?.toLowerCase() || email.trim().toLowerCase(),
  firstName,
  lastName,
  photo: "https://i.imgur.com/qzsiOuh.png",
  createdAt: new Date().toISOString(),
}, { merge: true });
      try {
        await sendEmailVerification(cred.user);
        toast.info("Verification email sent. Please check your inbox.");
      } catch {
        toast.error("Couldn't send verification right now. You can resend later.");
      }
      window.location.href = "/verify";
    } catch (e) {
      toast.error(e?.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Nav />

      <div className="signup-page">
        <div className="motto-section">
          <h1>Welcome to Livespace</h1>
          <p>
            Connect with friends, share your moments, and stay updated with your
            loved ones — all for free.
          </p>
        </div>

        <div className="signup-container">
          <div className="signup-header">
            <h1>New User?</h1>
            <p>Get connected with your friend circle online for free!</p>
          </div>

          <form className="signup-form" onSubmit={handleRegister} noValidate>
            {/* General error (screen-reader friendly) */}
            {errors.general && (
              <div className="form-error" role="alert" aria-live="polite">
                {errors.general}
              </div>
            )}

            <h2>Create new account</h2>

            <div className="form-group">
              <div className="input-wrap">
                <input
                  type="text"
                  placeholder="First name"
                  onChange={(e) => setFname(e.target.value)}
                  required
                  autoComplete="given-name"
                  className={errors.fname ? "is-error" : ""}
                  aria-invalid={!!errors.fname}
                  aria-describedby={errors.fname ? "fname-error" : undefined}
                />
                {errors.fname && (
                  <small id="fname-error" className="field-error">
                    {errors.fname}
                  </small>
                )}
              </div>

              <div className="input-wrap">
                <input
                  type="text"
                  placeholder="Last name"
                  onChange={(e) => setLname(e.target.value)}
                  autoComplete="family-name"
                  className={errors.lname ? "is-error" : ""}
                  aria-invalid={!!errors.lname}
                  aria-describedby={errors.lname ? "lname-error" : undefined}
                />
                {errors.lname && (
                  <small id="lname-error" className="field-error">
                    {errors.lname}
                  </small>
                )}
              </div>

              <div className="input-wrap">
                <input
                  type="email"
                  placeholder="Email address"
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  inputMode="email"
                  autoComplete="email"
                  className={errors.email ? "is-error" : ""}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                />
                {errors.email && (
                  <small id="email-error" className="field-error">
                    {errors.email}
                  </small>
                )}
              </div>

              {/* Confirm Email */}
              <div className="input-wrap">
                <input
                  type="email"
                  placeholder="Confirm email address"
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  required
                  inputMode="email"
                  autoComplete="email"
                  className={errors.confirmEmail ? "is-error" : ""}
                  aria-invalid={!!errors.confirmEmail}
                  aria-describedby={errors.confirmEmail ? "confirm-email-error" : undefined}
                />
                {errors.confirmEmail && (
                  <small id="confirm-email-error" className="field-error" role="alert" aria-live="polite">
                    {errors.confirmEmail}
                  </small>
                )}
              </div>

              {/* Password with show/hide toggle */}
           <div className="input-wrap password-wrap">
  <div className="control"> {/* NEW inner wrapper */}
    <input
      type={showPassword ? "text" : "password"}
      placeholder="New password"
      onChange={(e) => setPassword(e.target.value)}
      required
      minLength={8}
      pattern="(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).+"
      title="At least 8 characters, 1 uppercase, 1 number, and 1 special character."
      autoComplete="new-password"
      className={`password-input ${errors.password ? "is-error" : ""}`}
      aria-invalid={!!errors.password}
      aria-describedby="pw-hint pw-error"
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

  <small id="pw-hint" className="help-text">
    Must be 8+ chars and include 1 uppercase, 1 number, 1 special character.
  </small>
  {errors.password && (
    <small id="pw-error" className="field-error">
      {errors.password}
    </small>
  )}
</div>

            </div>

            <button
              type="submit"
              className="signup-button"
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? "Creating…" : "Sign Up"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
export default Signup;
