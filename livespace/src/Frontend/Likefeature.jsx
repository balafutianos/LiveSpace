// Likefeature.jsx
import React, { useEffect, useState } from "react";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "./firebase"; // ensure db is exported from ./firebase

/**
 * Likefeature component
 *
 * Props:
 * - postId: string (required)
 * - likes: array of userIds (optional)
 * - currentUserId: string (optional)
 * - onChange: function(newLikesArray) (optional)
 */
export default function Likefeature({ postId, likes = [], currentUserId, onChange }) {
  const [localLikes, setLocalLikes] = useState(Array.isArray(likes) ? likes : []);
  const [saving, setSaving] = useState(false);

  // sync when parent changes likes prop
  useEffect(() => {
    setLocalLikes(Array.isArray(likes) ? likes : []);
  }, [likes]);

  const hasLiked = !!currentUserId && localLikes.includes(currentUserId);

  const toggleLike = async () => {
    if (!currentUserId) {
      console.warn("User not authenticated - cannot like.");
      return;
    }

    // optimistic update
    const previous = localLikes;
    const newLocal = hasLiked
      ? localLikes.filter((id) => id !== currentUserId)
      : [...localLikes, currentUserId];
    setLocalLikes(newLocal);

    setSaving(true);
    try {
      const postRef = doc(db, "Posts", postId);
      if (hasLiked) {
        await updateDoc(postRef, { likes: arrayRemove(currentUserId) });
      } else {
        await updateDoc(postRef, { likes: arrayUnion(currentUserId) });
      }
      if (typeof onChange === "function") onChange(newLocal);
    } catch (err) {
      console.error("Error toggling like:", err);
      // rollback on error
      setLocalLikes(previous);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={toggleLike}
        disabled={saving}
        style={{
          background: hasLiked ? "#1a73e8" : "#eee",
          color: hasLiked ? "#fff" : "#111",
          border: "none",
          padding: "6px 10px",
          borderRadius: 6,
          cursor: saving ? "not-allowed" : "pointer"
        }}
        aria-pressed={hasLiked}
      >
        {hasLiked ? "Unlike" : "Like"}
      </button>
      <span style={{ color: "#555" }}>{localLikes.length} {localLikes.length === 1 ? "Like" : "Likes"}</span>
    </div>
  );
}
