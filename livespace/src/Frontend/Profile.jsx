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
import Navbar from "./Navbar";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const DEFAULT_COVER = "https://img.freepik.com/free-photo/gray-abstract-wireframe-technology-background_53876-101941.jpg?semt=ais_hybrid&w=740";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

function Profile() {
  const [userData, setUserData] = useState(null);
  const [coverPhoto, setCoverPhoto] = useState(DEFAULT_COVER);
  const [loading, setLoading] = useState(true);
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
          !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE
            ? FALLBACK_IMAGE
            : data.photo;
        const cover =
          !data.coverPhoto || data.coverPhoto === "" ? DEFAULT_COVER : data.coverPhoto;
        setUserData({ ...data, photo });
        setCoverPhoto(cover);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  // Upload handlers
  const handleUploadProfile = async (file) => {
    if (!file || !auth.currentUser) return;
    const imageRef = ref(storage, `profilePictures/${auth.currentUser.uid}`);
    await uploadBytes(imageRef, file);
    const downloadURL = await getDownloadURL(imageRef);
    await updateDoc(doc(db, "Users", auth.currentUser.uid), { photo: downloadURL });
    setUserData((prev) => ({ ...prev, photo: downloadURL }));
  };

  const handleUploadCover = async (file) => {
    if (!file || !auth.currentUser) return;
    const coverRef = ref(storage, `coverPhotos/${auth.currentUser.uid}`);
    await uploadBytes(coverRef, file);
    const downloadURL = await getDownloadURL(coverRef);
    await updateDoc(doc(db, "Users", auth.currentUser.uid), { coverPhoto: downloadURL });
    setCoverPhoto(downloadURL);
  };

  // Search
  const handleSearch = async () => {
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }
    const firstNameQuery = query(collection(db, "Users"), where("firstName", "==", term));
    const lastNameQuery = query(collection(db, "Users"), where("lastName", "==", term));
    const [firstNameSnapshot, lastNameSnapshot] = await Promise.all([
      getDocs(firstNameQuery),
      getDocs(lastNameQuery)
    ]);
    const seen = new Set();
    const results = [];
    [...firstNameSnapshot.docs, ...lastNameSnapshot.docs].forEach((doc) => {
      if (seen.has(doc.id)) return;
      seen.add(doc.id);
      const data = doc.data();
      const photo =
        !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE
          ? FALLBACK_IMAGE
          : data.photo;
      results.push({ id: doc.id, ...data, photo });
    });
    setSearchResults(results);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", fontFamily: "Arial, sans-serif" }}>
      {/* Navbar */}
      <Navbar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        handleSearch={handleSearch}
      />

      {/* Cover & profile */}
      <div style={{ position: "relative" }}>
        {/* Cover */}
        <div style={{ position: "relative" }}>
          <img
            src={coverPhoto}
            alt="Cover"
            style={{ width: "100%", height: "250px", objectFit: "cover" }}
          />
          <div
            className="cover-overlay"
            onClick={() => document.getElementById("coverInput").click()}
            style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: "rgba(0,0,0,0.4)",
              color: "white",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              opacity: 0,
              cursor: "pointer",
              transition: "opacity 0.3s"
            }}
          >
            Change Cover Photo
          </div>
          <input
            type="file"
            id="coverInput"
            accept="image/*"
            style={{ display: "none" }}
            onChange={async (e) => {
              if (e.target.files[0]) await handleUploadCover(e.target.files[0]);
            }}
          />
        </div>

        {/* Profile */}
        <div
          style={{
            position: "absolute",
            bottom: "-50px",
            left: "20px",
            width: "100px",
            height: "100px",
            borderRadius: "50%",
            overflow: "hidden",
            border: "4px solid white"
          }}
        >
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <img
              src={userData?.photo}
              alt="Profile"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div
              className="profile-overlay"
              onClick={() => document.getElementById("profileInput").click()}
              style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: "rgba(0,0,0,0.4)",
                color: "white",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                opacity: 0,
                cursor: "pointer",
                transition: "opacity 0.3s",
                borderRadius: "50%"
              }}
            >
              Change Photo
            </div>
            <input
              type="file"
              id="profileInput"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (e) => {
                if (e.target.files[0]) await handleUploadProfile(e.target.files[0]);
              }}
            />
          </div>
        </div>
      </div>

      {/* User info */}
      <div style={{ marginTop: "60px", paddingLeft: "20px" }}>
        <h2>{userData?.firstName} {userData?.lastName}</h2>
        <p>{userData?.email}</p>
      </div>

      {/* Search results */}
      <div style={{ marginTop: "20px", paddingLeft: "20px" }}>
        {searchResults.length === 0 && searchTerm && <p>No users found with that name.</p>}
        {searchResults.map((user) => (
          <div key={user.id} style={{ display: "flex", alignItems: "center", marginTop: "10px" }}>
            <img src={user.photo} alt="User" style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover" }} />
            <div style={{ marginLeft: "10px" }}>
              <strong>{user.firstName} {user.lastName}</strong><br />
              <small>{user.email}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Profile;
