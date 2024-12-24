import { signInWithEmailAndPassword } from "firebase/auth";

import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "./firebase";
import { setDoc, doc } from "firebase/firestore";
import { toast } from "react-toastify";
import "./Signup.css"; // Add a CSS file for additional styling

function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, "Users", user.uid), {
          email: user.email,
          firstName: fname,
          lastName: lname,
          photo: "",
        });
      }
      toast.success("User Registered Successfully!!", {
        position: "top-center",
      });
    } catch (error) {
      toast.error(error.message, {
        position: "bottom-center",
      });
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      console.log("User logged in Successfully");
      window.location.href = "/profile";
      toast.success("User logged in Successfully", {
        position: "top-center",
      });
    } catch (error) {
      toast.error(error.message, {
        position: "bottom-center",
      });
    }
  };

  return (
    <div>
      {/* Navbar with Login form */}
      <nav className="navbar">
        <div className="navbar-container">
          <h1>Livespace</h1>
          <form className="login-form" onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Email address"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
            />
            <button type="submit" className="login-button">
              Log In
            </button>
          </form>
        </div>
      </nav>

      {/* Signup Page Content */}
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
            <h1>Livespace</h1>
            <p>Get connected with your friend circle online for free!</p>
          </div>
          <form className="signup-form" onSubmit={handleRegister}>
            <h2>Create new account</h2>

            <div className="form-group">
              <input
                type="text"
                placeholder="First name"
                onChange={(e) => setFname(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Last name"
                onChange={(e) => setLname(e.target.value)}
              />
            </div>

            <div className="form-group">
              <input
                type="email"
                placeholder="Email address"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="New password"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="signup-button">
              Sign Up
            </button>

            <p className="forgot-password">
              Already registered? <a href="/Login">Log In</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Signup;
