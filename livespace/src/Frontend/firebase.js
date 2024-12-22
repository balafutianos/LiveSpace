// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAUXJ-wy4dZjBzCJnFARKmiRO57S7cfKqA",
  authDomain: "livespacezone.firebaseapp.com",
  projectId: "livespacezone",
  storageBucket: "livespacezone.firebasestorage.app",
  messagingSenderId: "456717202137",
  appId: "1:456717202137:web:f2b8313a77ae9f162404c8",
  measurementId: "G-2P1KENBCP0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);

export { app, auth };