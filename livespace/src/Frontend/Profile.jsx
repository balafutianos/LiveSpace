import React, { useEffect, useState } from "react";
import {
  onAuthStateChanged
} from "firebase/auth";
import {
  auth,
  db,
  storage
} from "./firebase";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";
import { useNavigate } from "react-router-dom";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

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
          !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE
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

    // Search by email exactly
    const q = query(usersRef, where("email", "==", searchTerm.trim()));

    const querySnapshot = await getDocs(q);
    const results = [];

    querySnapshot.forEach((doc) => {
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
    <div style={{ padding: "20px" }}>
      <h1>Welcome to your profile!</h1>
      <img
        src={userData?.photo}
        alt="Profile"
        style={{ width: "150px", borderRadius: "50%" }}
      />
      <p>
        Name: {userData?.firstName} {userData?.lastName}
      </p>
      <p>Email: {userData?.email}</p>

      <div style={{ marginTop: "20px" }}>
        <input type="file" onChange={handleImageChange} />
        <button onClick={handleUpload}>Upload Profile Picture</button>
      </div>

      <div style={{ marginTop: "40px" }}>
        <h2>Search Users by Email</h2>
        <input
          type="text"
          placeholder="Enter email (e.g. tasosanas2002@gmail.com)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button onClick={handleSearch} style={{ marginLeft: "10px" }}>
          Search
        </button>

        <div style={{ marginTop: "20px" }}>
          {searchResults.length === 0 && searchTerm && (
            <p>No users found with that email.</p>
          )}
          {searchResults.map((user) => (
            <div key={user.id} style={{ marginTop: "15px", display: "flex", alignItems: "center" }}>
              <img
                src={user.photo}
                alt="User"
                style={{ width: "50px", borderRadius: "50%" }}
              />
              <div style={{ marginLeft: "10px" }}>
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