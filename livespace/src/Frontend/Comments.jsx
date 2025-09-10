// Comments.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { db } from "./firebase";
import {
  addDoc, collection, serverTimestamp, onSnapshot, query, orderBy,
  doc, getDoc, deleteDoc, updateDoc
} from "firebase/firestore";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

async function notifyComment({ postOwnerId, commenterId, postId, text }) {
  if (!postOwnerId || !commenterId || postOwnerId === commenterId) return;

  const meSnap = await getDoc(doc(db, "Users", commenterId));
  const me = meSnap.exists() ? meSnap.data() : {};
  const actorFirstName = me.firstName || "";
  const actorLastName  = me.lastName || "";
  const actorPhoto     =
    !me.photo || me.photo === "" || me.photo === FIREBASE_DEFAULT_IMAGE
      ? FALLBACK_IMAGE
      : me.photo;

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

function normalizeUser(u) {
  if (!u) return { name: "Someone", photo: FALLBACK_IMAGE };
  const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "Someone";
  const photo =
    !u.photo || u.photo === "" || u.photo === FIREBASE_DEFAULT_IMAGE
      ? FALLBACK_IMAGE
      : u.photo;
  return { name, photo };
}

export default function Comments({ post, currentUserId }) {
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");

  // user lookups
  const [userCache, setUserCache] = useState({});
  const loadingUsersRef = useRef(new Set());

  // edit state
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    if (!post?.id) return;
    const qy = query(
      collection(db, "Posts", post.id, "Comments"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(qy, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setItems(rows);

      const missing = new Set(rows.map((r) => r.userId).filter(Boolean));
      missing.forEach((uid) => {
        if (userCache[uid] || loadingUsersRef.current.has(uid)) return;
        loadingUsersRef.current.add(uid);
        getDoc(doc(db, "Users", uid))
          .then((snap) => {
            const val = normalizeUser(snap.exists() ? snap.data() : null);
            setUserCache((prev) => ({ ...prev, [uid]: val }));
          })
          .finally(() => loadingUsersRef.current.delete(uid));
      });
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  const canDelete = (c) =>
    !!currentUserId && (currentUserId === c.userId || currentUserId === post?.userId);
  const canEdit = (c) => !!currentUserId && currentUserId === c.userId;

  const submit = async () => {
    const t = (text || "").trim();
    if (!t || !post?.id || !currentUserId) return;

    await addDoc(collection(db, "Posts", post.id, "Comments"), {
      postId: post.id,
      userId: currentUserId,
      text: t,
      createdAt: serverTimestamp(),
    });

    await notifyComment({
      postOwnerId: post.userId,
      commenterId: currentUserId,
      postId: post.id,
      text: t
    });

    setText("");
  };

  const handleDelete = async (commentId) => {
    if (!post?.id || !commentId) return;
    try {
      await deleteDoc(doc(db, "Posts", post.id, "Comments", commentId));
    } catch (e) {
      console.error("Delete comment failed:", e);
    }
  };

  // --- Edit handlers ---
  const startEdit = (comment) => {
    setEditingId(comment.id);
    setEditText(comment.text || "");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };
  const saveEdit = async () => {
    const t = (editText || "").trim();
    if (!t || !post?.id || !editingId) return; // prevent blank edits
    try {
      await updateDoc(doc(db, "Posts", post.id, "Comments", editingId), {
        text: t,
        editedAt: serverTimestamp(),
      });
      setEditingId(null);
      setEditText("");
      // onSnapshot will refresh the list
    } catch (e) {
      console.error("Edit comment failed:", e);
    }
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
          {items.map((c) => {
            const u = userCache[c.userId] || { name: "Loading…", photo: FALLBACK_IMAGE };
            const ts = c.createdAt?.seconds
              ? new Date(c.createdAt.seconds * 1000).toLocaleString()
              : "";
            const edited = !!c.editedAt;

            const isEditing = editingId === c.id;

            return (
              <div
                key={c.id}
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid #f1f1f1",
                  display: "grid",
                  gridTemplateColumns: "36px 1fr auto",
                  gap: 10,
                  alignItems: "start",
                }}
              >
                {/* Avatar */}
                <img
                  src={u.photo}
                  alt={u.name}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "1px solid #eee",
                  }}
                />

                {/* Text + meta */}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                    {u.name}
                  </div>

                  {!isEditing ? (
                    <>
                      <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{c.text}</div>
                      <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
                        {ts} {edited && <span style={{ marginLeft: 6 }}>(edited)</span>}
                      </div>
                    </>
                  ) : (
                    <>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={2}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          border: "1px solid #ddd",
                          borderRadius: 6,
                        }}
                      />
                      <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                        <button onClick={saveEdit} className="btn btn-primary">Save</button>
                        <button onClick={cancelEdit} className="btn btn-ghost">Cancel</button>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6 }}>
                  {!isEditing && canEdit(c) && (
                    <button
                      onClick={() => startEdit(c)}
                      className="btn btn-ghost"
                      style={{ padding: "4px 8px" }}
                      title="Edit comment"
                    >
                      Edit
                    </button>
                  )}
                  {canDelete(c) && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="btn btn-ghost"
                      style={{ padding: "4px 8px", color: "salmon", borderColor: "#5a2a2a" }}
                      title="Delete comment"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
