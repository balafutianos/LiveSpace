// Import Firebase modules
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAUXJ-wy4dZjBzCJnFARKmiRO57S7cfKqA",
  authDomain: "livespacezone.firebaseapp.com",
  projectId: "livespacezone",
  storageBucket: "livespacezone.firebasestorage.app",
  messagingSenderId: "456717202137",
  appId: "1:456717202137:web:f2b8313a77ae9f162404c8",
  measurementId: "G-2P1KENBCP0",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);

// Export services
export { app, auth, db };
