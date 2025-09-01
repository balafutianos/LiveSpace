import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "./firebase";

import {
  doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc,
  query, where, orderBy, serverTimestamp, deleteDoc, onSnapshot,
  getCountFromServer, limit
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useNavigate, useParams } from "react-router-dom";

import PhotoModal from "./PhotoModal";
import Navbar from "./Navbar";
import ProfileInfo from "./Profileinfo";
import Likefeature from "./Likefeature";
import FriendButton from "./FriendButton";
import Comments from "./Comments";
import FriendList from "./FriendList";

import "./profile.css";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const DEFAULT_COVER =
  "https://img.freepik.com/free-photo/gray-abstract-wireframe-technology-background_53876-101941.jpg?semt=ais_hybrid&w=740";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

function capitalize(word) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}
function findFirstUrl(text = "") {
  const m = text.match(/https?:\/\/[^\s<>"')]+/i);
  return m ? m[0] : null;
}
function renderTextWithLinks(text = "") {
  const urlRe = /(https?:\/\/[^\s<>"')]+)/gi;
  const parts = text.split(urlRe);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}
function extractYouTubeId(url = "") {
  try {
    const short = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
    if (short) return short[1];
    const watch = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/i);
    if (watch) return watch[1];
    const embed = url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i);
    if (embed) return embed[1];
    return null;
  } catch {
    return null;
  }
}
async function fetchYouTubeMeta(url) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function areWeFriends(viewerId, profileId) {
  const frRef = collection(db, "FriendRequests");
  const [a, b] = await Promise.all([
    getDocs(query(frRef, where("fromId", "==", viewerId), where("toId", "==", profileId), where("status", "==", "accepted"))),
    getDocs(query(frRef, where("fromId", "==", profileId), where("toId", "==", viewerId), where("status", "==", "accepted"))),
  ]);
  return a.size > 0 || b.size > 0;
}
async function getActorInfo(uid) {
  const snap = await getDoc(doc(db, "Users", uid));
  if (!snap.exists()) return { name: "Someone", photo: FALLBACK_IMAGE };
  const u = snap.data();
  const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || (u.email || "Someone");
  const photo =
    !u.photo || u.photo === "" || u.photo === FIREBASE_DEFAULT_IMAGE ? FALLBACK_IMAGE : u.photo;
  return { name, photo };
}
async function getFriendIds(uid) {
  const frRef = collection(db, "FriendRequests");
  const [fromAcc, toAcc] = await Promise.all([
    getDocs(query(frRef, where("fromId", "==", uid), where("status", "==", "accepted"))),
    getDocs(query(frRef, where("toId", "==", uid), where("status", "==", "accepted"))),
  ]);
  const ids = new Set();
  fromAcc.forEach((d) => ids.add(d.data().toId));
  toAcc.forEach((d) => ids.add(d.data().fromId));
  return [...ids];
}
async function shouldNotify(subscriberId, publisherId) {
  try {
    const snap = await getDoc(doc(db, "NotificationPrefs", `${subscriberId}__${publisherId}`));
    if (!snap.exists()) return true;
    return !!snap.data().enabled;
  } catch { return false; }
}
async function notifyFriendsOf(publisherId, payload) {
  try {
    const friends = await getFriendIds(publisherId);
    const actor = await getActorInfo(publisherId);
    await Promise.all(
      friends.map(async (fid) => {
        if (!(await shouldNotify(fid, publisherId))) return;
        await addDoc(collection(db, "Notifications"), {
          recipientId: fid,
          actorId: publisherId,
          actorName: actor.name,
          actorPhoto: actor.photo,
          type: payload.type,
          postId: payload.postId || "",
          text: payload.text || "",
          createdAt: serverTimestamp(),
          read: false,
        });
      })
    );
  } catch (e) {
    console.error("notifyFriendsOf error:", e);
  }
}
async function recordPhoto(userId, url, type) {
  try {
    const qy = query(
      collection(db, "Photos"),
      where("userId", "==", userId),
      where("url", "==", url),
      where("type", "==", type)
    );
    const snap = await getDocs(qy);
    if (!snap.empty) return snap.docs[0].id;
    const docRef = await addDoc(collection(db, "Photos"), {
      userId, url, type, createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (e) {
    console.error("recordPhoto error:", e);
    return null;
  }
}
async function createImagePost(userId, imageUrl, text) {
  const newPostRef = doc(collection(db, "Posts"));
  await setDoc(newPostRef, {
    userId, text: text || "", image: imageUrl, createdAt: new Date(), likes: [],
  });
  await notifyFriendsOf(userId, { type: "post", postId: newPostRef.id, text });
  return newPostRef.id;
}

export default function Profile() {
  const navigate = useNavigate();
  const params = useParams();
  const [authReady, setAuthReady] = useState(false);

  const [viewingUserId, setViewingUserId] = useState(null);
  const [userData, setUserData] = useState(null);
  const [coverPhoto, setCoverPhoto] = useState(DEFAULT_COVER);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({
    phone: "", email: "", sex: "Male", birthday: "", work: "", about: "", city: "",
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState(null);
  const [posts, setPosts] = useState([]);
  const [activePhoto, setActivePhoto] = useState(null);

  const [friendCount, setFriendCount] = useState(0);
  const [photosCount, setPhotosCount] = useState(0);
  const [recentPhotos, setRecentPhotos] = useState([]);

  const [isFriends, setIsFriends] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isOwnProfile = useMemo(
    () => auth.currentUser?.uid && viewingUserId && auth.currentUser.uid === viewingUserId,
    [viewingUserId, auth.currentUser?.uid]
  );

  /* ---------- Auth + routing ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { navigate("/login"); return; }
      setAuthReady(true);
    });
    return () => unsub();
  }, [navigate]);

  useEffect(() => {
    if (!authReady) return;
    const uidToView = params.uid || auth.currentUser?.uid;
    setViewingUserId(uidToView || null);
  }, [authReady, params.uid]);

  /* ---------- Load profile + posts + photos ---------- */
  useEffect(() => {
    if (!viewingUserId) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const userRef = doc(db, "Users", viewingUserId);
        const snap = await getDoc(userRef);

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
          const cover = !data.coverPhoto || data.coverPhoto === "" ? DEFAULT_COVER : data.coverPhoto;

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
            city: data.city || "",
          });
        } else if (mounted) {
          setUserData(null);
        }

        await fetchPosts(viewingUserId);
        await refreshFriendCount(viewingUserId);
        await refreshPhotoCount(viewingUserId);
        await fetchRecentPhotos(viewingUserId);
      } catch (err) {
        console.error("Error loading viewing profile:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingUserId]);

  // live friend count
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

  // live photos box
  useEffect(() => {
    if (!viewingUserId) return;
    const unsub = onSnapshot(
      query(collection(db, "Photos"), where("userId", "==", viewingUserId)),
      async () => {
        await refreshPhotoCount(viewingUserId);
        await fetchRecentPhotos(viewingUserId);
      }
    );
    return () => unsub();
  }, [viewingUserId]);

  // track friendship
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!auth.currentUser?.uid || !viewingUserId || auth.currentUser.uid === viewingUserId) {
        if (alive) setIsFriends(false);
        return;
      }
      const yes = await areWeFriends(auth.currentUser.uid, viewingUserId);
      if (alive) setIsFriends(yes);
    })();
    return () => { alive = false; };
  }, [auth.currentUser?.uid, viewingUserId]);

  /* ---------- Fetch posts ---------- */
  const fetchPosts = async (uid) => {
    if (!uid) return;
    try {
      const qy = query(collection(db, "Posts"), where("userId", "==", uid), orderBy("createdAt", "desc"));
      const snap = await getDocs(qy);

      const loaded = await Promise.all(
        snap.docs.map(async (d) => {
          const post = { id: d.id, ...d.data() };
          const url = findFirstUrl(post.text || "");
          if (url && (url.includes("youtube.com") || url.includes("youtu.be"))) {
            const meta = await fetchYouTubeMeta(url);
            if (meta) {
              post.youtubeMeta = { url, title: meta.title, thumbnail: meta.thumbnail_url };
            } else {
              const ytId = extractYouTubeId(url);
              if (ytId) {
                post.youtubeMeta = {
                  url, title: "YouTube video",
                  thumbnail: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
                };
              }
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

  async function refreshPhotoCount(uid) {
    try {
      if (!uid) return;
      const cnt = await getCountFromServer(query(collection(db, "Photos"), where("userId", "==", uid)));
      setPhotosCount(cnt.data().count || 0);
    } catch (e) {
      console.error("Photo count error:", e);
      setPhotosCount(0);
    }
  }

  // ---------- FIXED: client-side sort/limit (no composite index needed)
  async function fetchRecentPhotos(uid) {
    try {
      if (!uid) return;
      const snap = await getDocs(
        query(collection(db, "Photos"), where("userId", "==", uid))
      );
      const items = snap.docs
        .map((d) => {
          const data = d.data();
          const ts =
            (data.createdAt?.toMillis?.() && data.createdAt.toMillis()) ||
            (data.createdAt?.seconds && data.createdAt.seconds * 1000) ||
            0;
          return { id: d.id, ...data, _ts: ts };
        })
        .sort((a, b) => b._ts - a._ts)
        .slice(0, 12);

      setRecentPhotos(items);
    } catch (e) {
      console.error("fetchRecentPhotos error:", e);
      setRecentPhotos([]);
    }
  }

  /* ---------- Uploads ---------- */
  const handleUploadProfile = async (file) => {
    if (!file || !auth.currentUser || !isOwnProfile) return;
    try {
      const uid = auth.currentUser.uid;
      const imageRef = ref(storage, `profilePictures/${uid}`);
      await uploadBytes(imageRef, file);
      const url = await getDownloadURL(imageRef);

      await updateDoc(doc(db, "Users", uid), { photo: url });
      setUserData((p) => ({ ...p, photo: url }));

      await recordPhoto(uid, url, "profile");
      await createImagePost(uid, url, "Updated profile picture");

      await Promise.all([fetchPosts(uid), fetchRecentPhotos(uid), refreshPhotoCount(uid)]);
    } catch (err) {
      console.error("Error upload profile:", err);
    }
  };

  const handleUploadCover = async (file) => {
    if (!file || !auth.currentUser || !isOwnProfile) return;
    try {
      const uid = auth.currentUser.uid;
      const coverRef = ref(storage, `coverPhotos/${uid}`);
      await uploadBytes(coverRef, file);
      const url = await getDownloadURL(coverRef);

      await updateDoc(doc(db, "Users", uid), { coverPhoto: url });
      setCoverPhoto(url);

      await recordPhoto(uid, url, "cover");
      await createImagePost(uid, url, "Updated cover photo");

      await Promise.all([fetchPosts(uid), fetchRecentPhotos(uid), refreshPhotoCount(uid)]);
    } catch (err) {
      console.error("Error upload cover:", err);
    }
  };

  /* ---------- Posts (create/delete) ---------- */
  const handleCreatePost = async () => {
    if (!auth.currentUser || !isOwnProfile) return;
    try {
      let imageUrl = "";
      if (postImage) {
        const imageRef = ref(storage, `posts/${auth.currentUser.uid}_${Date.now()}`);
        await uploadBytes(imageRef, postImage);
        imageUrl = await getDownloadURL(imageRef);
      }

      const newRef = doc(collection(db, "Posts"));
      await setDoc(newRef, {
        userId: auth.currentUser.uid,
        text: (postText || "").trim(),
        image: imageUrl,
        createdAt: new Date(),
        likes: [],
      });

      if (imageUrl) await recordPhoto(auth.currentUser.uid, imageUrl, "post");

      await notifyFriendsOf(auth.currentUser.uid, {
        type: "post", postId: newRef.id, text: (postText || "").trim(),
      });

      setPostText("");
      setPostImage(null);
      await fetchPosts(auth.currentUser.uid);
      await fetchRecentPhotos(auth.currentUser.uid);
      await refreshPhotoCount(auth.currentUser.uid);
    } catch (err) {
      console.error("Error creating post:", err);
    }
  };

  const handleDeletePost = async (postId) => {
    const target = posts.find((p) => p.id === postId);
    if (!target || target.userId !== auth.currentUser?.uid) return;

    try {
      await deleteDoc(doc(db, "Posts", postId));
      setPosts((p) => p.filter((x) => x.id !== postId));

      if (target.image) {
        const photosQ = query(
          collection(db, "Photos"),
          where("userId", "==", auth.currentUser.uid),
          where("url", "==", target.image),
          where("type", "==", "post")
        );
        const photosSnap = await getDocs(photosQ);
        const deletions = photosSnap.docs.map((d) => deleteDoc(doc(db, "Photos", d.id)));
        await Promise.all(deletions);
      }
    } catch (err) {
      console.error("Error deleting post (and photo):", err);
    }
  };

  /* ---------- Search (Navbar) ---------- */
  const handleSearch = async () => {
    const raw = (searchTerm || "").trim();
    if (!raw) { setSearchResults([]); return; }
    try {
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

  /* ---------- Save/Cancel profile ---------- */
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
        city: profileForm.city || "",
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
      city: userData.city || "",
    });
    setEditing(false);
  };

  // open header photo in PhotoModal
  const openHeaderPhoto = async (type, url) => {
    if (!viewingUserId || !url) return;
    try {
      const qy = query(
        collection(db, "Photos"),
        where("userId", "==", viewingUserId),
        where("url", "==", url),
        where("type", "==", type)
      );
      const snap = await getDocs(qy);

      let photoId = null;
      let postId = null;

      if (snap.empty) {
        photoId = await recordPhoto(viewingUserId, url, type);
      } else {
        const d = snap.docs[0];
        photoId = d.id;
        postId = d.data().postId || null;
      }

      setActivePhoto({ id: photoId, userId: viewingUserId, url, type, postId });
    } catch (e) {
      console.error("openHeaderPhoto error:", e);
    }
  };

  if (loading) return <div className="profile-shell">Loading...</div>;

  const totalLikes = posts.reduce((acc, post) => acc + (post.likes?.length || 0), 0);

  return (
    <div className="profile-shell">
      <Navbar
        currentUserId={auth.currentUser?.uid}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        handleSearch={handleSearch}
        searchResults={searchResults}
      />

      {/* Cover */}
      <div className="profile-cover">
        <img
          src={coverPhoto}
          alt="Cover"
          onClick={() => openHeaderPhoto("cover", coverPhoto)}
          title="Open cover photo"
        />
        {isOwnProfile && (
          <input
            type="file"
            id="coverInput"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUploadCover(e.target.files[0])}
          />
        )}
      </div>

      {/* Name + actions */}
      <div className="profile-header">
        <div className="profile-id">
          <div className="profile-avatar">
            {isOwnProfile && (
              <input
                type="file"
                id="profileInput"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUploadProfile(e.target.files[0])}
              />
            )}
            <img
              src={userData?.photo}
              alt="Profile"
              onClick={() => openHeaderPhoto("profile", userData?.photo)}
              title="Open profile photo"
            />
          </div>

          <h2 className="profile-name">
            {userData?.firstName} {userData?.lastName}
          </h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!isOwnProfile && auth.currentUser?.uid && viewingUserId && (
            <>
              <FriendButton
                viewerId={auth.currentUser.uid}
                profileUserId={viewingUserId}
                onChanged={() => refreshFriendCount(viewingUserId)}
              />
              <button
                onClick={() => navigate(`/messages/${viewingUserId}`)}
                className="btn btn-ghost"
                title="Send message"
              >
                Message
              </button>
            </>
          )}

          {isOwnProfile && (
            <div className="kebab-wrap">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="btn btn-primary"
              >
                Update Info
              </button>
              {dropdownOpen && (
                <div className="kebab-menu">
                  <div
                    onClick={() => {
                      document.getElementById("profileInput").click();
                      setDropdownOpen(false);
                    }}
                    className="kebab-item"
                  >
                    Change Profile Picture
                  </div>
                  <div
                    onClick={() => {
                      document.getElementById("coverInput").click();
                      setDropdownOpen(false);
                    }}
                    className="kebab-item"
                  >
                    Change Cover Photo
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="stats-strip">
        <div className="stats-cell">
          <div className="num">{friendCount}</div>
          <div className="lbl">Friends</div>
        </div>
        <div className="divider" />
        <div className="stats-cell">
          <div className="num">{photosCount}</div>
          <div className="lbl">Photos</div>
        </div>
        <div className="divider" />
        <div className="stats-cell">
          <div className="num">{totalLikes}</div>
          <div className="lbl">Likes</div>
        </div>
      </div>

      {/* Three columns */}
      <div className="page-grid">
        {/* LEFT: Profile Info + Create Post */}
        <div className="col-left">
          <div className="card">
            <div className="card-h">Profile Info</div>
            <div className="card-b">
              <ProfileInfo
                userData={userData}
                editing={editing}
                profileForm={profileForm}
                setProfileForm={setProfileForm}
                setEditing={(v) => {
                  if (auth.currentUser?.uid === viewingUserId) setEditing(v);
                }}
                handleSaveProfile={handleSaveProfile}
                handleCancelEdit={handleCancelEdit}
                profileUserId={viewingUserId}
                canEdit={auth.currentUser?.uid === viewingUserId}
              />
            </div>
          </div>

          {isOwnProfile && (
            <div className="card mt-16">
              <div className="card-h">Create Post</div>
              <div className="card-b post-create">
                <textarea
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder="What's on your mind?"
                  rows="3"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) setPostImage(e.target.files[0]);
                  }}
                />
                <button onClick={handleCreatePost} className="btn btn-primary mt-12">
                  Post
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MIDDLE: Friends + Photos */}
        <div className="col-middle">
          <div className="card">
            <div className="card-h">Friends</div>
            <div className="card-b">
              <FriendList userId={viewingUserId} pageSize={5} />
            </div>
          </div>

          <div className="card mt-16">
            <div className="card-h">Photos</div>
            <div className="card-b">
              {recentPhotos.length === 0 ? (
                <div className="muted">No photos yet.</div>
              ) : (
                <div className="photos-grid">
                  {recentPhotos.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setActivePhoto(p)}
                      className="photos-grid-btn"
                      title="Open photo"
                    >
                      <img src={p.url} alt="photo" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Posts */}
        <div className="col-right">
          <div className="card">
            <div className="card-h">{isOwnProfile ? "Your Post" : "Posts"}</div>
            <div className="card-b">
              {posts.length === 0 && <p className="muted">No posts yet.</p>}

              {posts.map((post) => (
                <div key={post.id} className="post">
                  {post.text && <p>{renderTextWithLinks(post.text)}</p>}

                  {post.image && <img src={post.image} alt="Post" className="post-img" />}

                  {post.youtubeMeta && !post.image && (
                    <a
                      href={post.youtubeMeta.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open on YouTube"
                      style={{
                        display: "block",
                        border: "1px solid var(--line)",
                        borderRadius: "12px",
                        overflow: "hidden",
                        marginTop: 8,
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <img
                        src={post.youtubeMeta.thumbnail}
                        alt="YouTube thumbnail"
                        style={{ width: "100%", maxHeight: 360, objectFit: "cover" }}
                        loading="lazy"
                      />
                      <div style={{ padding: 8, background: "var(--panel-2)" }}>
                        <small className="muted">YOUTUBE.COM</small>
                        <div style={{ fontWeight: 700, marginTop: 4 }}>
                          {post.youtubeMeta.title}
                        </div>
                      </div>
                    </a>
                  )}

                  <small className="post-meta">
                    Posted on {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString() : ""}
                  </small>

                  <div className="mt-12">
                    <Likefeature
                      postId={post.id}
                      postOwnerId={post.userId}
                      likes={post.likes || []}
                      currentUserId={auth.currentUser?.uid}
                      onChange={(newLikes) =>
                        setPosts((prev) =>
                          prev.map((p) => (p.id === post.id ? { ...p, likes: newLikes } : p))
                        )
                      }
                    />
                  </div>

                  <Comments post={post} currentUserId={auth.currentUser?.uid} />

                  {post.userId === auth.currentUser?.uid && (
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="btn btn-ghost mt-12"
                      style={{ color: "salmon", borderColor: "#5a2a2a" }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {activePhoto && (
        <PhotoModal
          photo={activePhoto}
          currentUserId={auth.currentUser?.uid}
          onClose={() => setActivePhoto(null)}
          onDeleted={(deletedId, deletedPhoto) => {
            setRecentPhotos((prev) => prev.filter((x) => x.id !== deletedId));
            if (deletedPhoto?.type === "profile" && userData?.photo === deletedPhoto.url) {
              setUserData((p) => (p ? { ...p, photo: FALLBACK_IMAGE } : p));
            }
            if (deletedPhoto?.type === "cover" && coverPhoto === deletedPhoto.url) {
              setCoverPhoto(DEFAULT_COVER);
            }
            if (viewingUserId) refreshPhotoCount(viewingUserId);
          }}
        />
      )}
    </div>
  );
}
