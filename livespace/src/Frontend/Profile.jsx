// Profile.jsx
import React, { useEffect, useState, useMemo } from "react";
import ProfileInfo from "./ProfileInfo";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "./firebase";
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
  serverTimestamp,
  deleteDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "./Navbar";
import Likefeature from "./Likefeature";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const DEFAULT_COVER = "https://img.freepik.com/free-photo/gray-abstract-wireframe-technology-background_53876-101941.jpg?semt=ais_hybrid&w=740";
const FIREBASE_DEFAULT_IMAGE = "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

function Profile() {
  const { uid: routeUid } = useParams(); // if visiting someone else: /profile/:uid
  const [authedUser, setAuthedUser] = useState(null);

  const [userData, setUserData] = useState(null);
  const [coverPhoto, setCoverPhoto] = useState(DEFAULT_COVER);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [profileForm, setProfileForm] = useState({
    phone: "",
    email: "",
    sex: "Male",
    birthday: "",
    work: "",
    about: "",
    city: ""
  });

  // Search state for Navbar
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  // Posts state
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState(null);
  const [posts, setPosts] = useState([]);

  const navigate = useNavigate();

  // Who are we viewing?
  const viewedUserId = useMemo(() => routeUid || authedUser?.uid || null, [routeUid, authedUser]);
  const isOwnProfile = useMemo(
    () => !!authedUser && !!viewedUserId && authedUser.uid === viewedUserId,
    [authedUser, viewedUserId]
  );

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthedUser(user || null);
      if (!user && !routeUid) {
        // if not logged in and trying to see own profile page, push to login
        navigate("/login");
      }
    });
    return () => unsub();
  }, [navigate, routeUid]);

  // Load profile (for either self or other user)
  useEffect(() => {
    if (!viewedUserId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const userRef = doc(db, "Users", viewedUserId);
        const userDoc = await getDoc(userRef);

        // If we're on own profile and doc missing, ensure memberSince
        if (!userDoc.exists() && isOwnProfile && authedUser?.email) {
          await setDoc(
            userRef,
            { email: authedUser.email, memberSince: serverTimestamp() },
            { merge: true }
          );
        }

        const loaded = await getDoc(userRef);
        if (loaded.exists()) {
          const data = loaded.data();
          const photo =
            !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE
              ? FALLBACK_IMAGE
              : data.photo;
          const cover =
            !data.coverPhoto || data.coverPhoto === "" ? DEFAULT_COVER : data.coverPhoto;

          if (!cancelled) {
            setUserData({ ...data, photo });
            setCoverPhoto(cover);
            setProfileForm({
              phone: data.phone || "",
              email: data.email || authedUser?.email || "",
              sex: data.sex || "Male",
              birthday: data.birthday || "",
              work: data.work || "",
              about: data.about || "",
              city: data.city || ""
            });
          }
        } else {
          if (!cancelled) setUserData(null);
        }

        await fetchPosts(viewedUserId);
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewedUserId, isOwnProfile, authedUser]);

  /* --- Uploads (only affects own profile) --- */
  const handleUploadProfile = async (file) => {
    if (!file || !authedUser || !isOwnProfile) return;
    try {
      const imageRef = ref(storage, `profilePictures/${authedUser.uid}`);
      await uploadBytes(imageRef, file);
      const url = await getDownloadURL(imageRef);
      await updateDoc(doc(db, "Users", authedUser.uid), { photo: url });
      setUserData((p) => ({ ...p, photo: url }));
    } catch (err) {
      console.error("Error upload profile:", err);
    }
  };

  const handleUploadCover = async (file) => {
    if (!file || !authedUser || !isOwnProfile) return;
    try {
      const coverRef = ref(storage, `coverPhotos/${authedUser.uid}`);
      await uploadBytes(coverRef, file);
      const url = await getDownloadURL(coverRef);
      await updateDoc(doc(db, "Users", authedUser.uid), { coverPhoto: url });
      setCoverPhoto(url);
    } catch (err) {
      console.error("Error upload cover:", err);
    }
  };

  /* --- Posts (create/delete only on own profile) --- */
  const handleCreatePost = async () => {
    if (!authedUser || !isOwnProfile) return;
    try {
      let imageUrl = "";
      if (postImage) {
        const imageRef = ref(storage, `posts/${authedUser.uid}_${Date.now()}`);
        await uploadBytes(imageRef, postImage);
        imageUrl = await getDownloadURL(imageRef);
      }
      await addDoc(collection(db, "Posts"), {
        userId: authedUser.uid,
        text: postText.trim(),
        image: imageUrl,
        createdAt: new Date(),
        likes: []
      });
      setPostText("");
      setPostImage(null);
      await fetchPosts(viewedUserId);
    } catch (err) {
      console.error("Error creating post:", err);
    }
  };

  const fetchPosts = async (uid) => {
    try {
      const q = query(
        collection(db, "Posts"),
        where("userId", "==", uid),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const loaded = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.text || p.image);
      setPosts(loaded);
    } catch (err) {
      console.error("Error fetching posts:", err);
    }
  };

  const handleDeletePost = async (postId) => {
    if (!isOwnProfile) return;
    try {
      await deleteDoc(doc(db, "Posts", postId));
      setPosts((p) => p.filter((x) => x.id !== postId));
    } catch (err) {
      console.error("Error deleting post:", err);
    }
  };

  /* --- Search for Navbar --- */
  const handleSearch = async () => {
    if (!searchTerm?.trim()) return;
    try {
      const usersRef = collection(db, "Users");

      // firstName prefix
      const q1 = query(
        usersRef,
        where("firstName", ">=", searchTerm),
        where("firstName", "<=", searchTerm + "\uf8ff")
      );
      // email prefix
      const q2 = query(
        usersRef,
        where("email", ">=", searchTerm),
        where("email", "<=", searchTerm + "\uf8ff")
      );

      const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);

      const seen = new Set();
      const results = [...s1.docs, ...s2.docs]
        .filter((d) => {
          if (seen.has(d.id)) return false;
          seen.add(d.id);
          return true;
        })
        .map((d) => ({ id: d.id, ...d.data() }));

      setSearchResults(results);
    } catch (err) {
      console.error("Search error:", err);
    }
  };

  /* --- Save/Cancel profile (own only) --- */
  const handleSaveProfile = async () => {
    if (!authedUser || !isOwnProfile) return;
    try {
      const userRef = doc(db, "Users", authedUser.uid);
      const updates = {
        phone: profileForm.phone || "",
        email: profileForm.email || "",
        sex: profileForm.sex || "Male",
        birthday: profileForm.birthday || "",
        work: profileForm.work || "",
        about: profileForm.about || "",
        city: profileForm.city || ""
      };
      await setDoc(userRef, updates, { merge: true });
      const reloaded = await getDoc(userRef);
      if (reloaded.exists()) {
        const data = reloaded.data();
        const photo =
          !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE
            ? FALLBACK_IMAGE
            : data.photo;
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
      email: userData.email || authedUser?.email || "",
      sex: userData.sex || "Male",
      birthday: userData.birthday || "",
      work: userData.work || "",
      about: userData.about || "",
      city: userData.city || ""
    });
    setEditing(false);
  };

  if (loading) return <div>Loading...</div>;

  const totalLikes = posts.reduce((acc, post) => acc + (post.likes?.length || 0), 0);

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", fontFamily: "Arial, sans-serif" }}>
      <Navbar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        handleSearch={handleSearch}
        searchResults={searchResults}
      />

      {/* Cover + Avatar */}
      <div style={{ position: "relative", marginBottom: "40px" }}>
        <img
          src={coverPhoto}
          alt="Cover"
          style={{ width: "100%", height: "240px", objectFit: "cover" }}
        />
        {isOwnProfile && (
          <input
            type="file"
            id="coverInput"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files[0]) handleUploadCover(e.target.files[0]);
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            bottom: "-55px",
            left: "40px",
            width: "110px",
            height: "110px",
            borderRadius: "50%",
            overflow: "hidden",
            border: "4px solid white",
            background: "#eee"
          }}
        >
          {isOwnProfile && (
            <input
              type="file"
              id="profileInput"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files[0]) handleUploadProfile(e.target.files[0]);
              }}
            />
          )}
          <img
            src={userData?.photo}
            alt="Profile"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      </div>

      {/* Header: Name + Stats + Update button (Update only if own) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#1f2b39",
          color: "#fff",
          padding: "-16px 4px",
          marginTop: "-50px",
          borderRadius: "4px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <h2 style={{ marginLeft: "160px", fontSize: "24px" }}>
            {userData?.firstName} {userData?.lastName}
          </h2>
        </div>
        <div style={{ display: "flex", gap: "40px", alignItems: "center" }}>
          <div>
            <strong>Friends</strong>
            <div style={{ color: "#00ff90", textAlign: "center" }}>10</div>
          </div>
          <div>
            <strong>Photos</strong>
            <div style={{ color: "#00ff90", textAlign: "center" }}>10</div>
          </div>
          <div>
            <strong>Likes</strong>
            <div style={{ color: "#00ff90", textAlign: "center" }}>{totalLikes}</div>
          </div>

          {isOwnProfile && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{
                  backgroundColor: "#00ff90",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: "6px",
                  fontWeight: "bold",
                  marginRight: "23px",
                  cursor: "pointer"
                }}
              >
                Update Info
              </button>
              {dropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "40px",
                    right: 0,
                    backgroundColor: "#fff",
                    color: "#000",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    zIndex: 10
                  }}
                >
                  <div
                    onClick={() => {
                      document.getElementById("profileInput").click();
                      setDropdownOpen(false);
                    }}
                    style={{ padding: "10px", cursor: "pointer", borderBottom: "1px solid #eee" }}
                  >
                    Change Profile Picture
                  </div>
                  <div
                    onClick={() => {
                      document.getElementById("coverInput").click();
                      setDropdownOpen(false);
                    }}
                    style={{ padding: "10px", cursor: "pointer" }}
                  >
                    Change Cover Photo
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Profile Info (editing only on own profile) */}
      <ProfileInfo
        userData={userData}
        editing={isOwnProfile ? editing : false}
        profileForm={profileForm}
        setProfileForm={setProfileForm}
        setEditing={isOwnProfile ? setEditing : () => {}}
        handleSaveProfile={handleSaveProfile}
        handleCancelEdit={handleCancelEdit}
      />

      {/* Posts Section (create/delete only on own profile; viewing works for all) */}
      <div style={{ marginTop: "40px", paddingLeft: "24px", paddingRight: "24px", paddingBottom: "60px" }}>
        {isOwnProfile && (
          <>
            <h3>Create Post</h3>
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder="What's on your mind?"
              rows="3"
              style={{ width: "100%", padding: "8px" }}
            />
            <div style={{ marginTop: "8px" }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files[0]) setPostImage(e.target.files[0]);
                }}
              />
            </div>
            <button onClick={handleCreatePost} style={{ marginTop: "8px" }}>
              Post
            </button>
          </>
        )}

        <div style={{ marginTop: isOwnProfile ? "24px" : 0 }}>
          <h3>{isOwnProfile ? "Your Posts" : "Posts"}</h3>
          {posts.length === 0 && <p>No posts yet.</p>}
          {posts.map((post) => (
            <div
              key={post.id}
              style={{ border: "1px solid #ccc", padding: "10px", marginTop: "10px" }}
            >
              {post.text && <p>{post.text}</p>}
              {post.image && (
                <img
                  src={post.image}
                  alt="Post"
                  style={{ width: "100%", maxHeight: "360px", objectFit: "cover" }}
                />
              )}
              <small style={{ color: "#555", display: "block", marginTop: 8 }}>
                Posted on {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString() : ""}
              </small>
              <div style={{ marginTop: 8 }}>
                <Likefeature
  postId={post.id}
  likes={post.likes || []}
  currentUserId={authedUser?.uid}   // key: the logged-in user
  onChange={(newLikes) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, likes: newLikes } : p))
    );
  }}
/>

              </div>
              {isOwnProfile && (
                <button
                  onClick={() => handleDeletePost(post.id)}
                  style={{ marginTop: 8, color: "red" }}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Profile;
