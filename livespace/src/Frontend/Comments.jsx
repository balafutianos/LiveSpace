// Comments.jsx
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  addDoc, collection, serverTimestamp, onSnapshot, query, orderBy,
  doc, getDoc
} from "firebase/firestore";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";

async function notifyComment({ postOwnerId, commenterId, postId, text }) {
  if (!postOwnerId || !commenterId || postOwnerId === commenterId) return;

  const meSnap = await getDoc(doc(db, "Users", commenterId));
  const me = meSnap.exists() ? meSnap.data() : {};
  const actorFirstName = me.firstName || "";
  const actorLastName  = me.lastName || "";
  const actorPhoto     = !me.photo || me.photo === "" ? FALLBACK_IMAGE : me.photo;

  await addDoc(collection(db, "Notifications"), {
    recipientId: postOwnerId,
    actorId: commenterId,
    actorFirstName,
    actorLastName,
    actorPhoto,
    type: "comment",
    postId,
    text: text || "",
    createdAt: serverTimestamp(),
    read: false,
  });
}

export default function Comments({ post, currentUserId }) {
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!post?.id) return;
    const qy = query(
      collection(db, "Posts", post.id, "Comments"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(qy, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [post?.id]);

  const submit = async () => {
    const t = (text || "").trim();
    if (!t || !post?.id || !currentUserId) return;

    // 1) write comment
    await addDoc(collection(db, "Posts", post.id, "Comments"), {
      postId: post.id,
      userId: currentUserId,
      text: t,
      createdAt: serverTimestamp(),
    });

    // 2) notify owner
    await notifyComment({
      postOwnerId: post.userId,
      commenterId: currentUserId,
      postId: post.id,
      text: t
    });

    setText("");
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment…"
          style={{ flex: 1, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6 }}
        />
        <button onClick={submit} className="btn btn-ghost">Comment</button>
      </div>

      {items.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {items.map((c) => (
            <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid #f1f1f1" }}>
              <div style={{ fontSize: 14 }}>{c.text}</div>
              <div style={{ fontSize: 12, color: "#777" }}>
                {c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000).toLocaleString() : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
