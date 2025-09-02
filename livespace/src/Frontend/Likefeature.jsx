// Likefeature.jsx
import React, { useMemo, useState } from "react";
import { db } from "./firebase";
import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  addDoc,
  collection,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";

export default function Likefeature({
  postId,
  postOwnerId,
  likes = [],
  currentUserId,
  onChange = () => {},
}) {
  const [saving, setSaving] = useState(false);

  const hasLiked = useMemo(
    () => !!currentUserId && Array.isArray(likes) && likes.includes(currentUserId),
    [likes, currentUserId]
  );

  const count = Array.isArray(likes) ? likes.length : 0;

  const toggleLike = async () => {
    if (!currentUserId) {
      alert("Please sign in to like posts.");
      return;
    }
    if (!postId) return;

    try {
      setSaving(true);

      // optimistic
      const nextLikes = hasLiked
        ? likes.filter((id) => id !== currentUserId)
        : [...likes, currentUserId];
      onChange(nextLikes);

      const postRef = doc(db, "Posts", postId);
      if (hasLiked) {
        await updateDoc(postRef, { likes: arrayRemove(currentUserId) });
      } else {
        await updateDoc(postRef, { likes: arrayUnion(currentUserId) });

        // notify post owner
        if (postOwnerId && postOwnerId !== currentUserId) {
          try {
            const meSnap = await getDoc(doc(db, "Users", currentUserId));
            const me = meSnap.exists() ? meSnap.data() : {};

            await addDoc(collection(db, "Notifications"), {
              recipientId: postOwnerId,
              actorId: currentUserId,
              actorFirstName: me.firstName || "",
              actorLastName: me.lastName || "",
              actorPhoto:
                !me.photo || me.photo === "" ? FALLBACK_IMAGE : me.photo,
              type: "like",
              postId,
              text: "",
              createdAt: serverTimestamp(),
              read: false,
            });
          } catch (e) {
            console.error("Error creating like notification:", e);
          }
        }
      }
    } catch (err) {
      console.error("Error toggling like:", err);
      onChange(likes); // revert optimistic on error
      alert("Could not update like. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={toggleLike}
        disabled={saving}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid #ccc",
          cursor: saving ? "not-allowed" : "pointer",
          background: hasLiked ? "#00ff90" : "#f5f5f5",
          color: hasLiked ? "#052023" : "#333",
          fontWeight: 600,
        }}
        aria-pressed={hasLiked}
      >
        {hasLiked ? "Unlike" : "Like"}
      </button>
      <span style={{ color: "#555", fontSize: 14 }}>{count}</span>
    </div>
  );
}
