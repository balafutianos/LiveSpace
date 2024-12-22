// Home.jsx
import React from "react";
// import Navbar from "./Navbar";
// import "./menu.css";

function Signup() {
  return (
    <div className='signup-container'>
      <form className='signup-form'>
        <h2>Sign Up</h2>
        <label htmlFor="">
            Email:
            <input type="text" />
        </label>
        <label htmlFor="">
            Password:
            <input type="text" />
        </label>

      </form>
    </div>
  );
}

export default Signup;
