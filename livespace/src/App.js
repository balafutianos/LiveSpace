import logo from './logo.svg';
import { ToastContainer } from "react-toastify";
import './App.css';
import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Signup from "./Frontend/Signup"; // Import your Home component
import Login from './Frontend/Login';
import Profile from './Frontend/Profile';
function App() {
  return (
    <Router>
      <Routes>
        {/* Default route - this will render Home.jsx */}
        <Route path="/" element={<Signup />} />
        <Route path="/Login" element={<Login />} />
        <Route path="/Profile" element={<Profile />} />
        <Route path="/profile/:uid" element={<Profile />} />  
      </Routes>
    </Router>
  );
}

export default App;
