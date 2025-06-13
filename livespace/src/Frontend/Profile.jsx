import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "./firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
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

      const userDocRef = doc(db, "Users", user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        setUserData({ ...userDoc.data(), uid: user.uid });
      }
      setLoading(false);
    });

    return () => unsubscribe(); // Clean up listener
  }, [navigate]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !userData) return;

    const storageRef = ref(storage, `profilePics/${userData.uid}`);
    await uploadBytes(storageRef, file);

    const photoURL = await getDownloadURL(storageRef);

    // Update Firestore
    await updateDoc(doc(db, "Users", userData.uid), {
      photo: photoURL,
    });

    // Update UI
    setUserData((prev) => ({ ...prev, photo: photoURL }));
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Welcome to your profile!</h1>
      <img
        src={userData?.photo || "https://via.placeholder.com/150?text=No+Photo"}
        alt="Profile"
        style={{ width: "150px", borderRadius: "50%" }}
      />
      <div>
        <input type="file" accept="image/*" onChange={handleImageUpload} />
      </div>
      <p>Name: {userData?.firstName} {userData?.lastName}</p>
      <p>Email: {userData?.email}</p>
    </div>
  );
}

export default Profile;
