import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";
import { toast } from "react-toastify";
import { Eye, EyeOff } from "lucide-react";          
import "./Signup.css";
import { sendPasswordResetEmail } from "firebase/auth";

function Nav() {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);     
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
      case "auth/invalid-credential":
        return { general: "Email or password is incorrect." };
      case "auth/too-many-requests":
        return { general: "Too many attempts. Please try again later or reset your password." };
      case "auth/network-request-failed":
        return { general: "Network error. Check your connection and try again." };
      default:
        return { general: "Something went wrong. Please try again." };
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    setErrors({ email: "", password: "", general: "" });

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
      const friendly = getFriendlyMessage(error.code);
      setErrors((prev) => ({ ...prev, ...friendly }));
      toast.error(friendly.general || friendly.email || friendly.password || "Login failed", {
        position: "bottom-center",
      });
    } finally {
      setLoading(false);
    }
  };

const handleForgotPassword = async () => {
  if (!loginEmail.trim()) {
    toast.error("Enter your email address first.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, loginEmail.trim());
    toast.info("Password reset email sent. Please check your inbox.");
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      toast.error("No account found with that email.");
    } else if (error.code === "auth/invalid-email") {
      toast.error("Invalid email format.");
    } else {
      toast.error("Could not send reset email. Try again.");
    }
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

<a
  href="#"
  className="forgot-password"
  onClick={(e) => {
    e.preventDefault(); // stop page refresh
    if (!loginEmail.trim()) {
      toast.error("Please enter your email address first.");
      return;
    }

    sendPasswordResetEmail(auth, loginEmail.trim())
      .then(() => {
        toast.info("Password reset email sent. Please check your inbox.");
      })
      .catch((error) => {
        if (error.code === "auth/user-not-found") {
          toast.error("No account found with that email.");
        } else if (error.code === "auth/invalid-email") {
          toast.error("Invalid email format.");
        } else {
          toast.error("Could not send reset email. Try again.");
        }
      });
  }}
>
  Forgot Password?
</a>


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
              autoComplete="email"
              inputMode="email"
            />
            {errors.email && (
              <small id="login-email-error" className="field-error">
                {errors.email}
              </small>
            )}
          </div>

          {/* Password with eye inside the field */}
          <div className="input-wrap password-wrap">
            <div className="control">
              <input
                type={showPassword ? "text" : "password"}     // 👈 single type attribute
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                className={`input ${errors.password ? "is-error" : ""}`}
                aria-invalid={Boolean(errors.password)}
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
