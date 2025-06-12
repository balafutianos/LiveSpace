// Profile.jsx
import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom"; // optional if using React Router
import "./Profile.css"; // Optional: styling

function Profile() {
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserData = async () => {
      const user = auth.currentUser;
      if (!user) {
        navigate("/"); // Redirect to login if not logged in
        return;
      }

      const userDocRef = doc(db, "Users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        setUserData(userDocSnap.data());
      } else {
        console.error("No such user document!");
      }
    };

    fetchUserData();
  }, [navigate]);

  if (!userData) return <div>Loading...</div>;

  return (
    <div className="profile-container">
      <h1>Your Profile</h1>
      <div className="profile-card">
        <img
          src={
            userData.photo ||
            "https://via.placeholder.com/150?text=No+Photo"
          }
          alt="Profile"
          className="profile-pic"
        />
        <p><strong>Name:</strong> {userData.firstName} {userData.lastName}</p>
        <p><strong>Email:</strong> {userData.email}</p>
      </div>
    </div>
  );
}

export default Profile;
