import logo from './logo.svg';
import { ToastContainer } from "react-toastify";
import './App.css';
import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Signup from "./Frontend/Signup"; // Import your Home component

function App() {
  return (
    <Router>
      <Routes>
        {/* Default route - this will render Home.jsx */}
        <Route path="/" element={<Signup />} />
        
      </Routes>
    </Router>
  );
}

export default App;
