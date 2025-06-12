import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "./firebase";
import { setDoc, doc } from "firebase/firestore";
import { toast } from "react-toastify";
import "./Signup.css";
import Nav from "./Nav"; // Import the new Nav component

function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");

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

  return (
    <div>
      <Nav /> {/* Use the extracted Nav component */}

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
