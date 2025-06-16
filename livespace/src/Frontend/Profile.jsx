import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "./firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate } from "react-router-dom";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

function Profile() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
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

        // Replace Firebase's default photo with your own fallback
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

  if (loading) return <div>Loading...</div>;

  return (
    <div>
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
    </div>
  );
}

export default Profile;
