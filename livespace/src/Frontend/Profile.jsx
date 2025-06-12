import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

function Profile() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate("/login");
        return;
      }

      const userDoc = await getDoc(doc(db, "Users", user.uid));
      if (userDoc.exists()) {
        setUserData(userDoc.data());
      }
      setLoading(false);
    });

    return () => unsubscribe(); // Clean up listener
  }, [navigate]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Welcome to your profile!</h1>
      <img
        src={
          userData?.photo || "https://via.placeholder.com/150?text=No+Photo"
        }
        alt="Profile"
        style={{ width: "150px", borderRadius: "50%" }}
      />
      <p>Name: {userData?.firstName} {userData?.lastName}</p>
      <p>Email: {userData?.email}</p>
    </div>
  );
}

export default Profile;
