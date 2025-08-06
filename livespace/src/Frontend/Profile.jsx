// Profile.jsx
import React, { useEffect, useState } from "react";
import ProfileInfo from "./ProfileInfo";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "./firebase";
import { deleteDoc, doc as firestoreDoc } from "firebase/firestore";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import Likefeature from "./Likefeature";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const DEFAULT_COVER = "https://img.freepik.com/free-photo/gray-abstract-wireframe-technology-background_53876-101941.jpg?semt=ais_hybrid&w=740";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

function Profile() {
  const [userData, setUserData] = useState(null);
  const [coverPhoto, setCoverPhoto] = useState(DEFAULT_COVER);
  const [loading, setLoading] = useState(true);

  // profile info state
  const [editing, setEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({
    phone: "",
    email: "",
    sex: "Male",
    birthday: "",
    work: "",
    about: "",
    city: ""
  });

  // posts & search
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState(null);
  const [posts, setPosts] = useState([]);

  const navigate = useNavigate();

  // auth & load
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate("/login");
        return;
      }

      try {
        const userRef = doc(db, "Users", user.uid);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
          // create with memberSince
          await setDoc(userRef, { email: user.email || "", memberSince: serverTimestamp() }, { merge: true });
        }

        const loaded = await getDoc(userRef);
        if (loaded.exists()) {
          const data = loaded.data();
          const photo = !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE ? FALLBACK_IMAGE : data.photo;
          const cover = !data.coverPhoto || data.coverPhoto === "" ? DEFAULT_COVER : data.coverPhoto;
          setUserData({ ...data, photo });
          setCoverPhoto(cover);

          setProfileForm({
            phone: data.phone || "",
            email: data.email || user.email || "",
            sex: data.sex || "Male",
            birthday: data.birthday || "",
            work: data.work || "",
            about: data.about || "",
            city: data.city || ""
          });

          await fetchPosts(user.uid);
        } else {
          setUserData(null);
        }
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  /* --- Profile uploads --- */
  const handleUploadProfile = async (file) => {
    if (!file || !auth.currentUser) return;
    try {
      const imageRef = ref(storage, `profilePictures/${auth.currentUser.uid}`);
      await uploadBytes(imageRef, file);
      const url = await getDownloadURL(imageRef);
      await updateDoc(doc(db, "Users", auth.currentUser.uid), { photo: url });
      setUserData((p) => ({ ...p, photo: url }));
    } catch (err) {
      console.error("Error upload profile:", err);
    }
  };

  const handleUploadCover = async (file) => {
    if (!file || !auth.currentUser) return;
    try {
      const coverRef = ref(storage, `coverPhotos/${auth.currentUser.uid}`);
      await uploadBytes(coverRef, file);
      const url = await getDownloadURL(coverRef);
      await updateDoc(doc(db, "Users", auth.currentUser.uid), { coverPhoto: url });
      setCoverPhoto(url);
    } catch (err) {
      console.error("Error upload cover:", err);
    }
  };

  /* --- Posts --- */
  const handleCreatePost = async () => {
    if (!auth.currentUser) return;
    try {
      let imageUrl = "";
      if (postImage) {
        const imageRef = ref(storage, `posts/${auth.currentUser.uid}_${Date.now()}`);
        await uploadBytes(imageRef, postImage);
        imageUrl = await getDownloadURL(imageRef);
      }
      // initialize likes as empty array
      await addDoc(collection(db, "Posts"), {
        userId: auth.currentUser.uid,
        text: postText.trim(),
        image: imageUrl,
        createdAt: new Date(),
        likes: []
      });
      setPostText("");
      setPostImage(null);
      await fetchPosts(auth.currentUser.uid);
    } catch (err) {
      console.error("Error creating post:", err);
    }
  };

  const fetchPosts = async (uid) => {
    if (!uid) return;
    try {
      const q = query(collection(db, "Posts"), where("userId", "==", uid), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(p => p.text || p.image);
      setPosts(loaded);
    } catch (err) {
      console.error("Error fetching posts:", err);
    }
  };

  const handleDeletePost = async (postId) => {
    try {
      await deleteDoc(firestoreDoc(db, "Posts", postId));
      setPosts((p) => p.filter(x => x.id !== postId));
    } catch (err) {
      console.error("Error deleting post:", err);
    }
  };

  /* --- Search --- */
  const handleSearch = async () => {
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }
    try {
      const q1 = query(collection(db, "Users"), where("firstName", "==", term));
      const q2 = query(collection(db, "Users"), where("lastName", "==", term));
      const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      const seen = new Set();
      const results = [];
      [...s1.docs, ...s2.docs].forEach(d => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        const data = d.data();
        const photo = !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE ? FALLBACK_IMAGE : data.photo;
        results.push({ id: d.id, ...data, photo });
      });
      setSearchResults(results);
    } catch (err) {
      console.error("Search error:", err);
    }
  };

  /* --- Profile form save/cancel (passed to ProfileInfo) --- */
  const handleSaveProfile = async () => {
    if (!auth.currentUser) return;
    try {
      const userRef = doc(db, "Users", auth.currentUser.uid);
      // ensure memberSince exists
      const snapshot = await getDoc(userRef);
      const updates = {
        phone: profileForm.phone || "",
        email: profileForm.email || "",
        sex: profileForm.sex || "Male",
        birthday: profileForm.birthday || "",
        work: profileForm.work || "",
        about: profileForm.about || "",
        city: profileForm.city || ""
      };
      if (!snapshot.exists() || !snapshot.data().memberSince) {
        updates.memberSince = serverTimestamp();
      }
      await setDoc(userRef, updates, { merge: true });
      // reload userData
      const reloaded = await getDoc(userRef);
      if (reloaded.exists()) {
        const data = reloaded.data();
        const photo = !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE ? FALLBACK_IMAGE : data.photo;
        setUserData({ ...data, photo });
      }
      setEditing(false);
    } catch (err) {
      console.error("Error saving profile:", err);
    }
  };

  const handleCancelEdit = () => {
    if (!userData) return;
    setProfileForm({
      phone: userData.phone || "",
      email: userData.email || auth.currentUser?.email || "",
      sex: userData.sex || "Male",
      birthday: userData.birthday || "",
      work: userData.work || "",
      about: userData.about || "",
      city: userData.city || ""
    });
    setEditing(false);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", fontFamily: "Arial, sans-serif" }}>
      <Navbar searchTerm={searchTerm} setSearchTerm={setSearchTerm} handleSearch={handleSearch} />

      {/* Cover & profile */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "relative" }}>
          <img src={coverPhoto} alt="Cover" style={{ width: "100%", height: "260px", objectFit: "cover" }} />
          <div className="cover-overlay" onClick={() => document.getElementById("coverInput").click()}
               style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)", color: "white", display: "flex", justifyContent: "center", alignItems: "center", opacity: 0, cursor: "pointer", transition: "opacity 0.2s" }}>
            Change Cover Photo
          </div>
          <input type="file" id="coverInput" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
            if (e.target.files[0]) await handleUploadCover(e.target.files[0]);
          }} />
        </div>

        <div style={{ position: "absolute", bottom: "-50px", left: "24px", width: "110px", height: "110px", borderRadius: "50%", overflow: "hidden", border: "4px solid white", background: "#eee" }}>
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <img src={userData?.photo} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div className="profile-overlay" onClick={() => document.getElementById("profileInput").click()}
                 style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)", color: "white", display: "flex", justifyContent: "center", alignItems: "center", opacity: 0, cursor: "pointer", transition: "opacity 0.2s", borderRadius: "50%" }}>
              Change Photo
            </div>
            <input type="file" id="profileInput" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
              if (e.target.files[0]) await handleUploadProfile(e.target.files[0]);
            }} />
          </div>
        </div>
      </div>

      {/* ProfileInfo component */}
      <ProfileInfo
        userData={userData}
        editing={editing}
        profileForm={profileForm}
        setProfileForm={setProfileForm}
        setEditing={setEditing}
        handleSaveProfile={handleSaveProfile}
        handleCancelEdit={handleCancelEdit}
      />

      {/* Create post */}
      <div style={{ marginTop: "20px", paddingLeft: "20px" }}>
        <h3>Create Post</h3>
        <textarea value={postText} onChange={(e) => setPostText(e.target.value)} placeholder="What's on your mind?" rows="3" style={{ width: "100%", maxWidth: "600px", padding: "8px" }} />
        <div style={{ marginTop: "8px" }}>
          <input type="file" accept="image/*" onChange={(e) => { if (e.target.files[0]) setPostImage(e.target.files[0]); }} />
        </div>
        <button onClick={handleCreatePost} style={{ marginTop: "8px" }}>Post</button>
      </div>

      {/* Posts feed */}
      <div style={{ marginTop: "20px", paddingLeft: "20px", paddingBottom: 40 }}>
        <h3>Your Posts</h3>
        {posts.length === 0 && <p>No posts yet.</p>}
        {posts.map((post) => {
          return (
            <div key={post.id} style={{ border: "1px solid #ccc", padding: "10px", marginTop: "10px", maxWidth: "700px" }}>
              {post.text && <p>{post.text}</p>}
              {post.image && <img src={post.image} alt="Post" style={{ width: "100%", maxHeight: "360px", objectFit: "cover" }} />}
              <small style={{ color: "#555", display: "block", marginTop: 8 }}>
                Posted on {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString() : ""}
              </small>

              {/* Like feature component */}
              <div style={{ marginTop: 8 }}>
                <Likefeature
                  postId={post.id}
                  likes={post.likes || []}
                  currentUserId={auth.currentUser?.uid}
                  onChange={(newLikes) => {
                    setPosts((prev) => prev.map(p => p.id === post.id ? { ...p, likes: newLikes } : p));
                  }}
                />
              </div>

              <button onClick={() => handleDeletePost(post.id)} style={{ marginTop: 8, color: "red" }}>Delete</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Profile;
