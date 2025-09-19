// src/Frontend/Feed.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "./firebase";
import Likefeature from "./Likefeature";
import Comments from "./Comments";
import "./Feed.css";

const FALLBACK = "https://i.imgur.com/qzsiOuh.png";

/* ---------- helpers ---------- */
function useMiniUser(uid) {
  const [mini, setMini] = useState(null);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      try {
        const s = await getDoc(doc(db, "Users", uid));
        if (!alive) return;
        if (s.exists()) {
          const u = s.data() || {};
          const name =
            `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
            u.displayName ||
            (u.email || "").split("@")[0] ||
            "Someone";
          const photo = u.photo || FALLBACK;
          setMini({ name, photo });
        } else {
          setMini({ name: "Someone", photo: FALLBACK });
        }
      } catch {
        setMini({ name: "Someone", photo: FALLBACK });
      }
    })();
    return () => (alive = false);
  }, [uid]);
  return mini;
}

async function myFriendIds(uid) {
  const fr = collection(db, "FriendRequests");
  const [a, b] = await Promise.all([
    getDocs(query(fr, where("fromId", "==", uid), where("status", "==", "accepted"))),
    getDocs(query(fr, where("toId", "==", uid), where("status", "==", "accepted"))),
  ]);
  const s = new Set();
  a.forEach((d) => s.add(d.data().toId));
  b.forEach((d) => s.add(d.data().fromId));
  return Array.from(s);
}

/* ============================== FEED ============================== */
export default function Feed() {
  const me = auth.currentUser;
  const uid = me?.uid || null;

  // create post
  const [postText, setPostText] = useState("");
  const [postFile, setPostFile] = useState(null);
  const [creating, setCreating] = useState(false);

  // posts
  const [posts, setPosts] = useState([]);
  // inline edit
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editFile, setEditFile] = useState(null);
  const [editPreview, setEditPreview] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const [sourceIds, setSourceIds] = useState([]); // me + friends

  // build source set
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!uid) return;
      const friends = await myFriendIds(uid);
      if (!alive) return;
      setSourceIds([uid, ...friends]);
    })();
    return () => (alive = false);
  }, [uid]);

  // live posts from sources
  useEffect(() => {
    if (!uid || sourceIds.length === 0) return;
    const qy = query(
      collection(db, "Posts"),
      where("userId", "in", sourceIds.slice(0, 10)), // Firestore "in" limit 10; expand if needed by batching
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setPosts(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((p) => p.text || p.image) // ignore empties
        );
      },
      () => setPosts([])
    );
    return unsub;
  }, [uid, sourceIds]);

  /* ---------- create ---------- */
  async function uploadImage(file, pathPrefix) {
    const fname = `${Date.now()}_${file.name || "image.jpg"}`;
    const r = ref(storage, `${pathPrefix}/${uid}/${fname}`);
    await uploadBytes(r, file);
    return await getDownloadURL(r);
  }

  const createPost = async () => {
    if (!uid || (!postText && !postFile)) return;
    try {
      setCreating(true);
      let imageUrl = "";
      if (postFile) imageUrl = await uploadImage(postFile, "posts");

      const refDoc = doc(collection(db, "Posts"));
      await setDoc(refDoc, {
        userId: uid,
        text: (postText || "").trim(),
        image: imageUrl,
        createdAt: new Date(),
        likes: [],
      });

      setPostText("");
      setPostFile(null);
    } finally {
      setCreating(false);
    }
  };

  /* ---------- edit ---------- */
  const beginEdit = (p) => {
    if (p.userId !== uid) return;
    setEditingId(p.id);
    setEditText(p.text || "");
    setEditFile(null);
    setEditPreview(p.image || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditFile(null);
    setEditPreview("");
    setEditBusy(false);
  };

  const saveEdit = async (p) => {
    if (p.userId !== uid) return;
    try {
      setEditBusy(true);
      let newImage = editPreview || "";
      if (editFile) newImage = await uploadImage(editFile, "posts");

      await updateDoc(doc(db, "Posts", p.id), {
        text: (editText || "").trim(),
        image: newImage,
        updatedAt: serverTimestamp(),
      });

      cancelEdit();
    } catch {
      setEditBusy(false);
    }
  };

  /* ---------- delete ---------- */
  const removePost = async (postId, ownerId) => {
    if (ownerId !== uid) return;
    try {
      await deleteDoc(doc(db, "Posts", postId));
    } catch {}
  };

  /* ---------- render ---------- */
  const PostHeader = ({ p }) => {
    const mini = useMiniUser(p.userId);
    const mine = p.userId === uid;
    return (
      <div className="feed-hdr">
        <img className="feed-avatar" src={mini?.photo || FALLBACK} alt="" />
        <div className="feed-hnames">
          <div className="feed-author">
            {mini?.name || "Someone"} {mine && <span className="you-badge">You</span>}
          </div>
          <div className="feed-date">
            {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : ""}
          </div>
        </div>
        {mine && (
          <div className="feed-own-actions">
            <button className="mini-btn" onClick={() => beginEdit(p)}>Edit</button>
            <button className="mini-btn danger" onClick={() => removePost(p.id, p.userId)}>
              Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="feed-wrap">

      {/* composer */}
      <div className="composer card">
        <textarea
          placeholder="What's on your mind?"
          rows={3}
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
        />
        <div className="composer-row">
          <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
            Choose File
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => setPostFile(e.target.files?.[0] || null)}
            />
          </label>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={() => { setPostText(""); setPostFile(null); }}>
            Clear
          </button>
          <button className="btn btn-primary" disabled={creating} onClick={createPost}>
            {creating ? "Posting…" : "Post"}
          </button>
        </div>
      </div>

      {/* posts */}
      <div className="feed-list">
        {posts.map((p) => {
          const editing = editingId === p.id;
          return (
            <div key={p.id} className="feed-card card">
              <PostHeader p={p} />

              {!editing ? (
                <>
                  {p.text && <p className="feed-text">{p.text}</p>}
                  {p.image && (
                    <img className="feed-image" src={p.image} alt="post" loading="lazy" />
                  )}

                  <div className="mt-8">
                    <Likefeature
                      postId={p.id}
                      postOwnerId={p.userId}
                      likes={p.likes || []}
                      currentUserId={uid}
                      onChange={(likes) =>
                        setPosts((prev) =>
                          prev.map((x) => (x.id === p.id ? { ...x, likes } : x))
                        )
                      }
                    />
                  </div>

                  <Comments post={p} currentUserId={uid} />
                </>
              ) : (
                // EDIT MODE
                <div className="edit-box">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={4}
                  />
                  {editPreview ? (
                    <>
                      <img className="feed-image" src={editPreview} alt="preview" />
                      <div className="row gap">
                        <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
                          Replace image
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                setEditFile(f);
                                setEditPreview(URL.createObjectURL(f));
                              }
                            }}
                          />
                        </label>
                        <button
                          className="btn btn-ghost"
                          onClick={() => {
                            setEditFile(null);
                            setEditPreview("");
                          }}
                        >
                          Remove image
                        </button>
                      </div>
                    </>
                  ) : (
                    <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
                      Add image
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setEditFile(f);
                            setEditPreview(URL.createObjectURL(f));
                          }
                        }}
                      />
                    </label>
                  )}

                  <div className="row gap mt-8">
                    <button className="btn btn-primary" disabled={editBusy} onClick={() => saveEdit(p)}>
                      {editBusy ? "Saving…" : "Save"}
                    </button>
                    <button className="btn btn-ghost" disabled={editBusy} onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
