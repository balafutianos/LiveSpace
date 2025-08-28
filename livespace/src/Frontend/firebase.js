// Import Firebase modules
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // ✅ Add this line
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAUXJ-wy4dZjBzCJnFARKmiRO57S7cfKqA",
  authDomain: "livespacezone.firebaseapp.com",
  projectId: "livespacezone",
  storageBucket: "livespacezone.firebasestorage.app", // ✅ Fix this line (correct domain!)
  messagingSenderId: "456717202137",
  appId: "1:456717202137:web:f2b8313a77ae9f162404c8",
  measurementId: "G-2P1KENBCP0",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // ✅ Add this line

let messaging = null;
try {
  messaging = getMessaging(app);
} catch {}

// Export services
export { app, auth, db, storage }; // ✅ Export storage
