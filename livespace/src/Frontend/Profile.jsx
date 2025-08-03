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

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const DEFAULT_COVER = "https://images.unsplash.com/photo-1503264116251-35a269479413?auto=format&fit=crop&w=1350&q=80";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

function Profile() {
  const [userData, setUserData] = useState(null);
  const [coverPhoto, setCoverPhoto] = useState(DEFAULT_COVER);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedCover, setSelectedCover] = useState(null);
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

  // Profile picture
  const handleImageChange = (e) => {
    if (e.target.files[0]) setSelectedImage(e.target.files[0]);
  };

  const handleUploadProfile = async () => {
    if (!selectedImage || !auth.currentUser) return;

    const imageRef = ref(storage, `profilePictures/${auth.currentUser.uid}`);
    await uploadBytes(imageRef, selectedImage);
    const downloadURL = await getDownloadURL(imageRef);

    await updateDoc(doc(db, "Users", auth.currentUser.uid), { photo: downloadURL });
    setUserData((prev) => ({ ...prev, photo: downloadURL }));
    setSelectedImage(null);
  };

  // Cover photo
  const handleCoverChange = (e) => {
    if (e.target.files[0]) setSelectedCover(e.target.files[0]);
  };

  const handleUploadCover = async () => {
    if (!selectedCover || !auth.currentUser) return;

    const coverRef = ref(storage, `coverPhotos/${auth.currentUser.uid}`);
    await uploadBytes(coverRef, selectedCover);
    const downloadURL = await getDownloadURL(coverRef);

    await updateDoc(doc(db, "Users", auth.currentUser.uid), { coverPhoto: downloadURL });
    setCoverPhoto(downloadURL);
    setSelectedCover(null);
  };

  // Search
  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const q = query(collection(db, "Users"), where("email", "==", searchTerm.trim()));
    const snapshot = await getDocs(q);

    const results = [];
    snapshot.forEach((doc) => {
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
      <nav style={{
        backgroundColor: "#122939",
        color: "#27D496",
        padding: "10px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div style={{ fontWeight: "bold", fontSize: "18px" }}>LiveSpaceZone</div>
        <div>
          <input
            type="text"
            placeholder="Search by email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: "5px", borderRadius: "4px", border: "none", marginRight: "5px" }}
          />
          <button
            onClick={handleSearch}
            style={{ padding: "6px 10px", borderRadius: "4px", border: "none", backgroundColor: "#555", color: "white" }}
          >
            Search
          </button>
        </div>
      </nav>

      {/* Cover */}
      <div style={{ position: "relative" }}>
        <img src={coverPhoto} alt="Cover" style={{ width: "100%", height: "250px", objectFit: "cover" }} />
        {/* Profile */}
        <div style={{
          position: "absolute", bottom: "-50px", left: "20px",
          borderRadius: "50%", overflow: "hidden", width: "100px", height: "100px",
          border: "4px solid white"
        }}>
          <img src={userData?.photo} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </div>

      <div style={{ marginTop: "60px", paddingLeft: "20px" }}>
        <h2>{userData?.firstName} {userData?.lastName}</h2>
        <p>{userData?.email}</p>
      </div>

      {/* Upload buttons */}
      <div style={{ marginTop: "20px", paddingLeft: "20px" }}>
        <input type="file" onChange={handleCoverChange} />
        <button onClick={handleUploadCover}>Upload Cover Photo</button>
        <div style={{ marginTop: "10px" }}>
          <input type="file" onChange={handleImageChange} />
          <button onClick={handleUploadProfile}>Upload Profile Picture</button>
        </div>
      </div>

      {/* Search results */}
      <div style={{ marginTop: "20px", paddingLeft: "20px" }}>
        {searchResults.length === 0 && searchTerm && <p>No users found with that email.</p>}
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
