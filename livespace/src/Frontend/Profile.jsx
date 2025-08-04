import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "./firebase";
import { deleteDoc, doc as firestoreDoc } from "firebase/firestore";

import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy
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
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState(null);
  const [posts, setPosts] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        console.log("User not authenticated, redirecting to login");
        navigate("/login");
        return;
      }

      console.log("Authenticated user:", user.uid);
      try {
        const userDocRef = doc(db, "Users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const data = userDoc.data();
          console.log("User data fetched:", data);

          const photo =
            !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE
              ? FALLBACK_IMAGE
              : data.photo;

          const cover =
            !data.coverPhoto || data.coverPhoto === "" ? DEFAULT_COVER : data.coverPhoto;

          setUserData({ ...data, photo });
          setCoverPhoto(cover);

          await fetchPosts(user.uid);
        } else {
          console.warn("⚠️ User document does not exist!");
          setUserData(null);
        }
      } catch (error) {
        console.error("🔥 Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // Upload profile picture
  const handleUploadProfile = async (file) => {
    if (!file || !auth.currentUser) return;
    try {
      const imageRef = ref(storage, `profilePictures/${auth.currentUser.uid}`);
      await uploadBytes(imageRef, file);
      const downloadURL = await getDownloadURL(imageRef);
      await updateDoc(doc(db, "Users", auth.currentUser.uid), { photo: downloadURL });
      setUserData((prev) => ({ ...prev, photo: downloadURL }));
      console.log("✅ Profile picture updated");
    } catch (error) {
      console.error("❌ Error uploading profile picture:", error);
    }
  };

  const handleDeletePost = async (postId) => {
  try {
    await deleteDoc(firestoreDoc(db, "Posts", postId));
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    console.log("🗑️ Post deleted:", postId);
  } catch (error) {
    console.error("❌ Error deleting post:", error);
  }
};


  // Upload cover photo
  const handleUploadCover = async (file) => {
    if (!file || !auth.currentUser) return;
    try {
      const coverRef = ref(storage, `coverPhotos/${auth.currentUser.uid}`);
      await uploadBytes(coverRef, file);
      const downloadURL = await getDownloadURL(coverRef);
      await updateDoc(doc(db, "Users", auth.currentUser.uid), { coverPhoto: downloadURL });
      setCoverPhoto(downloadURL);
      console.log("✅ Cover photo updated");
    } catch (error) {
      console.error("❌ Error uploading cover photo:", error);
    }
  };

  // Create post
  const handleCreatePost = async () => {
    if (!auth.currentUser) return;
    try {
      let imageUrl = "";
      if (postImage) {
        const imageRef = ref(storage, `posts/${auth.currentUser.uid}_${Date.now()}`);
        await uploadBytes(imageRef, postImage);
        imageUrl = await getDownloadURL(imageRef);
      }

      await addDoc(collection(db, "Posts"), {
        userId: auth.currentUser.uid,
        text: postText.trim(),
        image: imageUrl,
        createdAt: new Date()
      });

      setPostText("");
      setPostImage(null);
      await fetchPosts(auth.currentUser.uid);
      console.log("✅ Post created");
    } catch (error) {
      console.error("❌ Failed to create post:", error);
    }
  };

  // Fetch posts
  const fetchPosts = async (uid) => {
  if (!uid) return;
  try {
    const q = query(
      collection(db, "Posts"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    const userPosts = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter((post) => post.text || post.image); // filter out empty posts
    setPosts(userPosts);
  } catch (error) {
    console.error("❌ Error fetching posts:", error);
  }
};


  // Search
  const handleSearch = async () => {
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }
    try {
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
    } catch (error) {
      console.error("❌ Error searching users:", error);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", fontFamily: "Arial, sans-serif" }}>
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

      {/* Create Post */}
      <div style={{ marginTop: "20px", paddingLeft: "20px" }}>
        <h3>Create Post</h3>
        <textarea
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          placeholder="What's on your mind?"
          rows="3"
          style={{ width: "100%", maxWidth: "500px", padding: "8px" }}
        />
        <div style={{ marginTop: "5px" }}>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              if (e.target.files[0]) setPostImage(e.target.files[0]);
            }}
          />
        </div>
        <button onClick={handleCreatePost} style={{ marginTop: "5px" }}>
          Post
        </button>
      </div>

      {/* Posts feed */}
      <div style={{ marginTop: "20px", paddingLeft: "20px" }}>
        <h3>Your Posts</h3>
        {posts.length === 0 && <p>No posts yet.</p>}
        {posts.map((post) => (
          <div key={post.id} style={{ border: "1px solid #ccc", padding: "10px", marginTop: "10px", maxWidth: "500px" }}>
            {post.text && <p>{post.text}</p>}
            {post.image && <img src={post.image} alt="Post" style={{ width: "100%", maxHeight: "300px", objectFit: "cover" }} />}
            <small style={{ color: "#555" }}>
              Posted on {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString() : ""}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Profile;
