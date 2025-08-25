// PhotoModal.jsx
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  query,
  where,
  getDocs,
  deleteDoc,
  setDoc, // <-- needed for creating the post
} from "firebase/firestore";
import Likefeature from "./Likefeature";
import Comments from "./Comments";

const backdrop = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};
const panel = {
  width: "min(900px, 96vw)",
  maxHeight: "90vh",
  overflow: "auto",
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 20px 60px rgba(0,0,0,.35)",
};

export default function PhotoModal({
  photo, // { id, userId, url, type, postId? }
  currentUserId,
  onClose,
  onDeleted = () => {},
}) {
  const [post, setPost] = useState(null);
  const isOwner = currentUserId && photo?.userId === currentUserId;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!photo?.postId) {
        setPost(null);
        return;
      }
      const snap = await getDoc(doc(db, "Posts", photo.postId));
      if (alive) setPost(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    })();
    return () => {
      alive = false;
    };
  }, [photo?.postId]);

  // Create a post thread for this photo if it doesn't have one yet
  const createThread = async () => {
    if (!isOwner || !photo?.url) return;

    // Create a new post document with the photo attached
    const newRef = doc(collection(db, "Posts"));
    await setDoc(newRef, {
      userId: currentUserId,
      text: "",
      image: photo.url,
      createdAt: new Date(),
      likes: [],
    });

    // Backfill postId into Photo doc (and any duplicates with same url/type)
    const qy = query(
      collection(db, "Photos"),
      where("userId", "==", currentUserId),
      where("url", "==", photo.url),
      where("type", "==", photo.type)
    );
    const snap = await getDocs(qy);
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { postId: newRef.id })));

    setPost({
      id: newRef.id,
      userId: currentUserId,
      text: "",
      image: photo.url,
      createdAt: new Date(),
      likes: [],
    });
  };

  const deleteFromPhotos = async () => {
    if (!isOwner || !photo?.id) return;
    await deleteDoc(doc(db, "Photos", photo.id)); // remove from Photos box only
    onDeleted(photo.id);
    onClose();
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 12,
            borderBottom: "1px solid #eee",
          }}
        >
          <div>
            <strong>{photo?.type?.toUpperCase()}</strong>
            {post ? (
              <span style={{ marginLeft: 8, color: "#666" }}>thread linked</span>
            ) : (
              <span style={{ marginLeft: 8, color: "#666" }}>no thread</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {isOwner && !post && (
              <button
                onClick={createThread}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  background: "#f7f7f7",
                  cursor: "pointer",
                }}
              >
                Create post thread
              </button>
            )}
            {isOwner && (
              <button
                onClick={deleteFromPhotos}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #f33",
                  background: "#ffecec",
                  color: "#b00",
                  cursor: "pointer",
                }}
              >
                Remove from Photos
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#f7f7f7",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Image */}
        <div style={{ maxHeight: "60vh", overflow: "hidden", background: "#000" }}>
          <img
            src={photo?.url}
            alt="photo"
            style={{
              width: "100%",
              height: "auto",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>

        {/* Thread (likes + comments) */}
        <div style={{ padding: 12 }}>
          {!post && (
            <div style={{ color: "#666" }}>
              This photo isn’t linked to a post yet.{" "}
              {isOwner
                ? "Click “Create post thread” to enable likes & comments."
                : "Owner can create a thread to enable likes & comments."}
            </div>
          )}

          {post && (
            <>
              <div style={{ marginTop: 8 }}>
                <Likefeature
                  postId={post.id}
                  postOwnerId={post.userId}
                  likes={post.likes || []}
                  currentUserId={currentUserId}
                  onChange={(newLikes) =>
                    setPost((p) => (p ? { ...p, likes: newLikes } : p))
                  }
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <Comments post={post} currentUserId={currentUserId} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
