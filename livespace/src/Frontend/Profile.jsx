import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "./firebase";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate } from "react-router-dom";
import "./Profile.css"; // Import CSS

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const DEFAULT_COVER =
  "https://images.unsplash.com/photo-1503264116251-35a269479413?auto=format&fit=crop&w=1350&q=80";

function Profile() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate("/login");
        return;
      }

      const userDoc = await getDoc(doc(db, "Users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const photo =
          !data.photo || data.photo === ""
            ? FALLBACK_IMAGE
            : data.photo;
        setUserData({ ...data, photo });
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleImageChange = (e) => {
    if (e.target.files[0]) {
      setSelectedImage(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedImage || !auth.currentUser) return;

    const imageRef = ref(storage, `profilePictures/${auth.currentUser.uid}`);
    await uploadBytes(imageRef, selectedImage);
    const downloadURL = await getDownloadURL(imageRef);

    await updateDoc(doc(db, "Users", auth.currentUser.uid), {
      photo: downloadURL,
    });

    setUserData((prev) => ({ ...prev, photo: downloadURL }));
    setSelectedImage(null);
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const usersRef = collection(db, "Users");
    const q = query(usersRef, where("email", "==", searchTerm.trim()));
    const querySnapshot = await getDocs(q);
    const results = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const photo =
        !data.photo || data.photo === ""
          ? FALLBACK_IMAGE
          : data.photo;
      results.push({ id: doc.id, ...data, photo });
    });

    setSearchResults(results);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="profile-container">
      <div className="cover-photo">
        <img src={DEFAULT_COVER} alt="Cover" />
      </div>
      <div className="profile-section">
        <div className="profile-picture">
          <img src={userData?.photo} alt="Profile" />
        </div>
        <div className="profile-info">
          <h2>{userData?.firstName} {userData?.lastName}</h2>
          <p>{userData?.email}</p>
          <input type="file" onChange={handleImageChange} />
          <button onClick={handleUpload}>Update Profile Picture</button>
        </div>
        <div className="profile-actions">
          <button>Update Profile</button>
          <button>View Activity</button>
        </div>
      </div>

      <div className="search-section">
        <h3>Search Users by Email</h3>
        <input
          type="text"
          placeholder="Enter email"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button onClick={handleSearch}>Search</button>
        <div className="search-results">
          {searchResults.length === 0 && searchTerm && (
            <p>No users found with that email.</p>
          )}
          {searchResults.map((user) => (
            <div key={user.id} className="search-user">
              <img src={user.photo} alt="User" />
              <div>
                <strong>{user.firstName} {user.lastName}</strong><br />
                <small>{user.email}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Profile;
