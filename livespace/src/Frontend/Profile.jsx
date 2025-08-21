// Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
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
  deleteDoc,
  onSnapshot,
  getCountFromServer
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate, useParams } from "react-router-dom";

import Navbar from "./Navbar";
import ProfileInfo from "./ProfileInfo";
import Likefeature from "./Likefeature";
import FriendButton from "./FriendButton";
import FriendInbox from "./FriendInbox";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const DEFAULT_COVER =
  "https://img.freepik.com/free-photo/gray-abstract-wireframe-technology-background_53876-101941.jpg?semt=ais_hybrid&w=740";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

function capitalize(word) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// --- Link helpers (YouTube) ---
function extractYouTubeId(url = "") {
  try {
    // youtu.be/<id>
    const short = url.match(/https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{6,})/i);
    if (short) return short[1];

    // youtube.com/watch?v=<id>
    const watch = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/i);
    if (watch) return watch[1];

    // youtube.com/embed/<id>
    const embed = url.match(/https?:\/\/(?:www\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i);
    if (embed) return embed[1];

    return null;
  } catch {
    return null;
  }
}

function findFirstUrl(text = "") {
  const m = text.match(/https?:\/\/[^\s<>")]+/i);
  return m ? m[0] : null;
}

function getYouTubeThumbUrl(id) {
  // hqdefault is reliable
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export default function Profile() {
  const navigate = useNavigate();
  const params = useParams(); // expects optional :uid
  const [authReady, setAuthReady] = useState(false);

  // Who's page are we viewing?
  const [viewingUserId, setViewingUserId] = useState(null);

  // Header/profile state
  const [userData, setUserData] = useState(null);
  const [coverPhoto, setCoverPhoto] = useState(DEFAULT_COVER);
  const [loading, setLoading] = useState(true);

  // ProfileInfo editing
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

  // Search (Navbar)
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  // Posts
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState(null);
  const [posts, setPosts] = useState([]);

  // Friends
  const [friendCount, setFriendCount] = useState(0);
  const isOwnProfile = useMemo(
    () => auth.currentUser?.uid && viewingUserId && auth.currentUser.uid === viewingUserId,
    [viewingUserId, auth.currentUser?.uid]
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // --- Auth + route handling ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        navigate("/login");
        return;
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [navigate]);

  // Decide viewing user id when auth or route param changes
  useEffect(() => {
    if (!authReady) return;
    const uidToView = params.uid || auth.currentUser?.uid;
    setViewingUserId(uidToView || null);
  }, [authReady, params.uid]);

  // Load profile + posts for viewingUserId
  useEffect(() => {
    if (!viewingUserId) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const userRef = doc(db, "Users", viewingUserId);
        const snap = await getDoc(userRef);

        // If we are on our own profile and the doc doesn't exist, create skeleton
        if (!snap.exists() && auth.currentUser?.uid === viewingUserId) {
          await setDoc(
            userRef,
            { email: auth.currentUser.email || "", memberSince: serverTimestamp() },
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

          if (!mounted) return;
          setUserData({ ...data, photo });
          setCoverPhoto(cover);
          setProfileForm({
            phone: data.phone || "",
            email: data.email || "",
            sex: data.sex || "Male",
            birthday: data.birthday || "",
            work: data.work || "",
            about: data.about || "",
            city: data.city || ""
          });
        } else {
          if (!mounted) return;
          setUserData(null);
        }

        await fetchPosts(viewingUserId);
        await refreshFriendCount(viewingUserId);
      } catch (err) {
        console.error("Error loading viewing profile:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingUserId]);

  // Listen to accepted friendships for the viewed profile (string IDs only)
  useEffect(() => {
    if (!viewingUserId) return;
    const frRef = collection(db, "FriendRequests");

    const unsub1 = onSnapshot(
      query(frRef, where("fromId", "==", viewingUserId), where("status", "==", "accepted")),
      () => refreshFriendCount(viewingUserId)
    );
    const unsub2 = onSnapshot(
      query(frRef, where("toId", "==", viewingUserId), where("status", "==", "accepted")),
      () => refreshFriendCount(viewingUserId)
    );

    return () => { unsub1(); unsub2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingUserId]);


async function fetchYouTubeMeta(url) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (!res.ok) return null;
    return await res.json(); // contains title, author_name, thumbnail_url
  } catch {
    return null;
  }
}




  // --- Helpers ---
 const fetchPosts = async (uid) => {
  if (!uid) return;
  try {
    const qy = query(
      collection(db, "Posts"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(qy);
    const loaded = await Promise.all(
  snap.docs.map(async (d) => {
    const post = { id: d.id, ...d.data() };

    const url = findFirstUrl(post.text || "");
    if (url && (url.includes("youtube.com") || url.includes("youtu.be"))) {
      const meta = await fetchYouTubeMeta(url);
      if (meta) {
        post.youtubeMeta = {
          url,
          title: meta.title,
          thumbnail: meta.thumbnail_url,
        };
      }
    }
    return post;
  })
);

    setPosts(loaded.filter((p) => p.text || p.image));
  } catch (err) {
    console.error("Error fetching posts:", err);
  }
};


  async function refreshFriendCount(uid) {
    try {
      if (!uid) return;
      const frRef = collection(db, "FriendRequests");
      const [fromAccepted, toAccepted] = await Promise.all([
        getCountFromServer(query(frRef, where("fromId", "==", uid), where("status", "==", "accepted"))),
        getCountFromServer(query(frRef, where("toId", "==", uid), where("status", "==", "accepted"))),
      ]);
      setFriendCount(fromAccepted.data().count + toAccepted.data().count);
    } catch (e) {
      console.error("Friend count error:", e);
      setFriendCount(0);
    }
  }

  // --- Uploads (only allow on own profile) ---
  const handleUploadProfile = async (file) => {
    if (!file || !auth.currentUser || !isOwnProfile) return;
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
    if (!file || !auth.currentUser || !isOwnProfile) return;
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

  // --- Posts (can only create on own profile) ---
  const handleCreatePost = async () => {
    if (!auth.currentUser || !isOwnProfile) return;
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

  const handleDeletePost = async (postId) => {
    const target = posts.find(p => p.id === postId);
    if (!target || target.userId !== auth.currentUser?.uid) return;

    try {
      await deleteDoc(doc(db, "Posts", postId));
      setPosts((p) => p.filter((x) => x.id !== postId));
    } catch (err) {
      console.error("Error deleting post:", err);
    }
  };

  // --- Search (Navbar) ---
  const handleSearch = async () => {
    const raw = (searchTerm || "").trim();
    if (!raw) {
      setSearchResults([]);
      return;
    }
    try {
      // email exact
      if (raw.includes("@")) {
        const qEmail = query(collection(db, "Users"), where("email", "==", raw));
        const sEmail = await getDocs(qEmail);
        const results = sEmail.docs.map((d) => {
          const data = d.data();
          const photo =
            !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE
              ? FALLBACK_IMAGE
              : data.photo;
          return { id: d.id, ...data, photo };
        });
        setSearchResults(results);
        return;
      }

      const variants = [raw, raw.toLowerCase(), capitalize(raw.toLowerCase()), raw.toUpperCase()];
      const seen = new Set();
      const results = [];

      for (const v of variants) {
        const q1 = query(collection(db, "Users"), where("firstName", "==", v));
        const s1 = await getDocs(q1);
        s1.forEach((d) => {
          if (seen.has(d.id)) return;
          seen.add(d.id);
          const data = d.data();
          const photo =
            !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE
              ? FALLBACK_IMAGE
              : data.photo;
          results.push({ id: d.id, ...data, photo });
        });

        const q2 = query(collection(db, "Users"), where("lastName", "==", v));
        const s2 = await getDocs(q2);
        s2.forEach((d) => {
          if (seen.has(d.id)) return;
          seen.add(d.id);
          const data = d.data();
          const photo =
            !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE
              ? FALLBACK_IMAGE
              : data.photo;
          results.push({ id: d.id, ...data, photo });
        });

        if (results.length > 0) break;
      }

      setSearchResults(results);
    } catch (err) {
      console.error("Search error:", err);
      setSearchResults([]);
    }
  };

  // --- Save/Cancel profile (own profile only) ---
  const handleSaveProfile = async () => {
    if (!auth.currentUser || !isOwnProfile) return;
    try {
      const userRef = doc(db, "Users", auth.currentUser.uid);
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

      const re = await getDoc(userRef);
      if (re.exists()) {
        const data = re.data();
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
      email: userData.email || "",
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
// Turn any http(s)://... in text into <a> links
function renderTextWithLinks(text = "") {
  const urlRe = /(https?:\/\/[^\s<>"')]+)/gi; // capture URLs
  const parts = text.split(urlRe);            // split, keeping URLs as items

  return parts.map((part, i) => {
    const isUrl = i % 2 === 1; // captured groups end up at odd indexes
    if (!isUrl) return <React.Fragment key={i}>{part}</React.Fragment>;

    return (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#1a73e8", textDecoration: "underline" }}
      >
        {part}
      </a>
    );
  });
}

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", fontFamily: "Arial, sans-serif" }}>
      <Navbar
        currentUserId={auth.currentUser?.uid}
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
              if (e.target.files && e.target.files[0]) handleUploadCover(e.target.files[0]);
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
                if (e.target.files && e.target.files[0]) handleUploadProfile(e.target.files[0]);
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

      {/* Header row */}
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
            <strong>Friend List</strong>
            <div style={{ color: "#00ff90", textAlign: "center" }}>{friendCount}</div>
          </div>
          <div>
            <strong>Photos</strong>
            <div style={{ color: "#00ff90", textAlign: "center" }}>10</div>
          </div>
          <div>
            <strong>Likes</strong>
            <div style={{ color: "#00ff90", textAlign: "center" }}>{totalLikes}</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
            {!isOwnProfile && auth.currentUser?.uid && viewingUserId && (
              <FriendButton
                viewerId={auth.currentUser.uid}
                profileUserId={viewingUserId}
                onChanged={() => refreshFriendCount(viewingUserId)}
              />
            )}

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
      </div>

      {/* Inbox (only on own profile) */}
      {isOwnProfile && auth.currentUser?.uid && (
        <FriendInbox currentUserId={auth.currentUser.uid} />
      )}

      {/* Profile Info card */}
      <ProfileInfo
        userData={userData}
        editing={editing}
        profileForm={profileForm}
        setProfileForm={setProfileForm}
        // prevent visitors from flipping edit mode
        setEditing={(v) => { if (auth.currentUser?.uid === viewingUserId) setEditing(v); }}
        handleSaveProfile={handleSaveProfile}
        handleCancelEdit={handleCancelEdit}
        profileUserId={viewingUserId}
        canEdit={auth.currentUser?.uid === viewingUserId}
      />

      {/* Posts */}
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
                  if (e.target.files && e.target.files[0]) setPostImage(e.target.files[0]);
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
              {post.text && (
  <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
    {renderTextWithLinks(post.text)}
  </p>
)}


              {/* Uploaded image */}
              {post.image && (
                <img
                  src={post.image}
                  alt="Post"
                  style={{ width: "100%", maxHeight: "360px", objectFit: "cover" }}
                />
              )}

              {/* YouTube thumbnail preview (only if no uploaded image) */}
              {/* YouTube preview card */}
{/* YouTube preview card */}
{post.youtubeMeta && !post.image && (
  <a
    href={post.youtubeMeta.url}
    target="_blank"
    rel="noopener noreferrer"
    style={{
      display: "block",
      border: "1px solid #ccc",
      borderRadius: "6px",
      overflow: "hidden",
      marginTop: 8,
      textDecoration: "none",
      color: "inherit"
    }}
  >
    <img
      src={post.youtubeMeta.thumbnail}
      alt="YouTube thumbnail"
      style={{ width: "100%", maxHeight: "360px", objectFit: "cover" }}
    />
    <div style={{ padding: "8px", background: "#f9f9f9" }}>
      <small style={{ color: "#555" }}>YOUTUBE.COM</small>
      <div style={{ fontWeight: "bold", marginTop: "4px" }}>
        {post.youtubeMeta.title}
      </div>
    </div>
  </a>
)}



              <small style={{ color: "#555", display: "block", marginTop: 8 }}>
                Posted on {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString() : ""}
              </small>

              <div style={{ marginTop: 8 }}>
                <Likefeature
                  postId={post.id}
                  likes={post.likes || []}
                  currentUserId={auth.currentUser?.uid}
                  onChange={(newLikes) =>
                    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, likes: newLikes } : p)))
                  }
                />
              </div>

              {post.userId === auth.currentUser?.uid && (
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