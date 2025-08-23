// Comments.jsx
import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  deleteDoc,
  getDoc
} from "firebase/firestore";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

async function getUserInfo(uid) {
  try {
    const snap = await getDoc(doc(db, "Users", uid));
    if (!snap.exists()) return { firstName: "", lastName: "", photo: FALLBACK_IMAGE };
    const u = snap.data();
    const photo =
      !u.photo || u.photo === "" || u.photo === FIREBASE_DEFAULT_IMAGE ? FALLBACK_IMAGE : u.photo;
    return {
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      photo
    };
  } catch {
    return { firstName: "", lastName: "", photo: FALLBACK_IMAGE };
  }
}

export default function Comments({ post, currentUserId }) {
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const postId = post.id;

  // live list of comments for this post
  useEffect(() => {
    if (!postId) return;
    const q = query(
      collection(db, "Posts", postId, "Comments"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, async (snap) => {
      const rows = await Promise.all(
        snap.docs.map(async (d) => {
          const c = { id: d.id, ...d.data() };
          // resolve commenter mini-profile for UI (first/last/photo)
          const u = await getUserInfo(c.userId);
          c._firstName = u.firstName;
          c._lastName = u.lastName;
          c._photo = u.photo;
          return c;
        })
      );
      setItems(rows);
    });
    return () => unsub();
  }, [postId]);

  const submit = async () => {
    const val = (text || "").trim();
    if (!val || !currentUserId) return;
    try {
      // create comment
      const newRef = await addDoc(collection(db, "Posts", postId, "Comments"), {
        postId,
        userId: currentUserId,
        text: val,
        createdAt: serverTimestamp()
      });

      setText("");

      // after the comment
if (post.userId && post.userId !== currentUserId) {
  const me = await getUserInfo(currentUserId); // returns {firstName,lastName,photo}
  await addDoc(collection(db, "Notifications"), {
    recipientId: post.userId,          
    actorId: currentUserId,            
    actorFirstName: me.firstName,
    actorLastName:  me.lastName,
    actorPhoto:     me.photo,
    type: "comment",                   
    postId: post.id,
    text: (text || "").trim(),         
    createdAt: serverTimestamp(),
    read: false
  });
}

    } catch (e) {
      console.error("add comment error:", e);
    }
  };

  const remove = async (commentId, commentUserId) => {
    // UI double-check; rules also protect deletes (author or post owner)
    if (!currentUserId) return;
    if (currentUserId !== commentUserId && currentUserId !== post.userId) return;
    try {
      await deleteDoc(doc(db, "Posts", postId, "Comments", commentId));
    } catch (e) {
      console.error("delete comment error:", e);
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment..."
          style={{ flex: 1, padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <button onClick={submit} style={{ padding: "8px 12px", borderRadius: 6 }}>
          Comment
        </button>
      </div>

      {/* list */}
      <div style={{ marginTop: 10 }}>
        {items.length === 0 && (
          <div style={{ color: "#777", fontSize: 13 }}>No comments yet.</div>
        )}
        {items.map((c) => {
          const name = `${c._firstName || ""} ${c._lastName || ""}`.trim() || "Someone";
          return (
            <div key={c.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #eee" }}>
              <img
                src={c._photo || FALLBACK_IMAGE}
                alt={name}
                style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{c.text}</div>
                <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>
                  {c.createdAt?.seconds
                    ? new Date(c.createdAt.seconds * 1000).toLocaleString()
                    : ""}
                </div>
              </div>
              {(currentUserId === c.userId || currentUserId === post.userId) && (
                <button
                  onClick={() => remove(c.id, c.userId)}
                  style={{ background: "transparent", border: "none", color: "#c00", cursor: "pointer" }}
                  title="Delete comment"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
