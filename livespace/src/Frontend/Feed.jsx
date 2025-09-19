import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as qlimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "./firebase";

const PAGE_SIZE = 12;           // posts per page
const IN_CHUNK = 10;            // Firestore 'in' operator supports up to 10 values

/* ---------------------- helpers ---------------------- */
const norm = (v) => String(v ?? "").trim();

function nameFromUser(u = {}) {
  const fn = u.firstName ?? u.firstname ?? u.givenName ?? u.given_name ?? "";
  const ln = u.lastName ?? u.lastname ?? u.familyName ?? u.family_name ?? "";
  const full = `${fn} ${ln}`.trim();
  return full || u.fullName || u.displayName || u.name || "Unknown";
}

async function getFriendIds(currentUid) {
  const me = norm(currentUid);
  const ids = new Set();

  // Friends (array pair)
  try {
    const frQ = query(collection(db, "Friends"), where("userIds", "array-contains", me));
    const s = await getDocs(frQ);
    s.forEach((d) => {
      const arr = (d.data()?.userIds || []).map(norm);
      const other = arr.find((x) => x && x !== me);
      if (other) ids.add(other);
    });
  } catch {}

  // legacy friends (directional, accepted)
  try {
    const a = query(collection(db, "friends"), where("fromId", "==", me), where("status", "==", "accepted"));
    const b = query(collection(db, "friends"), where("toId", "==", me), where("status", "==", "accepted"));
    const [sa, sb] = await Promise.all([getDocs(a), getDocs(b)]);
    sa.forEach((d) => { const o = norm(d.data()?.toId); if (o && o !== me) ids.add(o); });
    sb.forEach((d) => { const o = norm(d.data()?.fromId); if (o && o !== me) ids.add(o); });
  } catch {}

  // accepted FriendRequests fallback (if pair doc not created)
  try {
    const r1 = query(collection(db, "FriendRequests"), where("fromId", "==", me), where("status", "==", "accepted"));
    const r2 = query(collection(db, "FriendRequests"), where("toId", "==", me), where("status", "==", "accepted"));
    const [s1, s2] = await Promise.all([getDocs(r1), getDocs(r2)]);
    s1.forEach((d) => { const o = norm(d.data()?.toId); if (o && o !== me) ids.add(o); });
    s2.forEach((d) => { const o = norm(d.data()?.fromId); if (o && o !== me) ids.add(o); });
  } catch {}

  // include me (show my own posts)
  ids.add(me);
  return Array.from(ids);
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/* ---------------------- Post Card ---------------------- */
function PostCard({ post, currentUid, onToggleLike }) {
  const mine = post.userId === currentUid;
  const liked = (post.likes || []).includes(currentUid);
  const likeText = liked ? "Unlike" : "Like";

  const ts = post.createdAt?.toMillis
    ? post.createdAt.toMillis()
    : post.createdAt?.seconds
    ? post.createdAt.seconds * 1000
    : Date.now();

  const when = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(ts);

  return (
    <article
      style={{
        background: "#0f172a",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 14,
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img
          src={post.authorPhoto}
          alt={post.authorName}
          style={{ width: 36, height: 36, borderRadius: 9999, objectFit: "cover", border: "1px solid rgba(255,255,255,0.15)" }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {post.authorName || "Unknown"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{when}</div>
        </div>
        {mine && (
          <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.7 }}>You</span>
        )}
      </div>

      {/* text */}
      {post.text && (
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 15, lineHeight: 1.4 }}>
          {post.text}
        </div>
      )}

      {/* image */}
      {post.image && post.image !== "" && (
        <img
          src={post.image}
          alt=""
          style={{
            width: "100%",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "#0b1220",
          }}
          loading="lazy"
        />
      )}

      {/* actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
        <button className="btn btn-ghost" onClick={() => onToggleLike(post)}>{likeText}</button>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          {(post.likes?.length || 0)} like{(post.likes?.length || 0) === 1 ? "" : "s"}
        </div>
      </div>
    </article>
  );
}

/* ---------------------- Composer ---------------------- */
function Composer({ onPost }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const me = auth.currentUser;

  const canPost = text.trim().length > 0 || !!file;

  const submit = async () => {
    if (!me) return;
    if (!canPost) return;

    let imageUrl = "";
    if (file) {
      // upload
      const path = `postImages/${me.uid}/${Date.now()}_${file.name}`;
      const r = ref(storage, path);
      await uploadBytes(r, file);
      imageUrl = await getDownloadURL(r);
    }

    await onPost({
      userId: me.uid,
      text: text.trim(),
      image: imageUrl, // rules require the field to exist ("" if none)
    });

    setText("");
    setFile(null);
  };

  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        color: "#e2e8f0",
      }}
    >
      <textarea
        placeholder="What's on your mind?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        style={{
          width: "100%",
          resize: "vertical",
          background: "#0b1220",
          color: "#fff",
          border: "1px solid #334155",
          borderRadius: 8,
          padding: 10,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ fontSize: 13 }}
        />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => { setText(""); setFile(null); }} disabled={!text && !file}>
            Clear
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!canPost}>
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------- Main Feed ---------------------- */
export default function Feed() {
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);   // merged, sorted desc
  const [hasMore, setHasMore] = useState(true);
  const lastCursorRef = useRef(null);       // timestamp (ms) we page from

  const me = auth.currentUser?.uid || null;

  // map cache of author profiles to avoid refetching
  const [userCache, setUserCache] = useState({}); // uid -> {name, photo}

  const hydrateAuthors = async (docs) => {
    const need = new Set();
    docs.forEach((p) => {
      const uid = p.userId;
      if (uid && !userCache[uid]) need.add(uid);
    });
    const nextCache = { ...userCache };
    for (const uid of need) {
      try {
        const s = await getDoc(doc(db, "Users", uid));
        if (s.exists()) {
          const u = s.data() || {};
          nextCache[uid] = {
            name: nameFromUser(u),
            photo:
              u.photo && u.photo !== ""
                ? u.photo
                : "https://i.imgur.com/qzsiOuh.png",
          };
        }
      } catch {}
    }
    setUserCache(nextCache);
  };

  const queryPage = async (friendIds, beforeTs /* millis or null */) => {
    // chunk into groups of up to 10 ids (limit of 'in')
    const chunks = chunk(friendIds, IN_CHUNK);

    const perChunkPromises = chunks.map(async (ids) => {
      let qref = query(
        collection(db, "Posts"),
        where("userId", "in", ids),
        orderBy("createdAt", "desc"),
        qlimit(PAGE_SIZE * 2) // slightly overfetch; we'll merge and slice globally
      );
      if (beforeTs) {
        // filter older than the global cursor
        qref = query(
          collection(db, "Posts"),
          where("userId", "in", ids),
          where("createdAt", "<", new Date(beforeTs)),
          orderBy("createdAt", "desc"),
          qlimit(PAGE_SIZE * 2)
        );
      }
      const snap = await getDocs(qref);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    });

    const batches = await Promise.all(perChunkPromises);
    // merge & sort
    const merged = batches.flat().sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return tb - ta;
    });

    return merged;
  };

  const loadInitial = React.useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const friendIds = await getFriendIds(me);

    const first = await queryPage(friendIds, null);
    await hydrateAuthors(first);

    const page = first.slice(0, PAGE_SIZE);
    setPosts(page);
    setHasMore(first.length > page.length);

    const last = page[page.length - 1];
    const lastTs = last?.createdAt?.toMillis
      ? last.createdAt.toMillis()
      : last?.createdAt?.seconds
      ? last.createdAt.seconds * 1000
      : null;
    lastCursorRef.current = lastTs;

    setLoading(false);
  }, [me]); // eslint-disable-line

  const loadMore = React.useCallback(async () => {
    if (!me || !hasMore) return;
    const friendIds = await getFriendIds(me);
    const nextBatch = await queryPage(friendIds, lastCursorRef.current);
    await hydrateAuthors(nextBatch);

    // filter out any already loaded (by id)
    const known = new Set(posts.map((p) => p.id));
    const merged = nextBatch.filter((p) => !known.has(p.id));

    const newPage = merged.slice(0, PAGE_SIZE);
    if (newPage.length === 0) {
      setHasMore(false);
      return;
    }

    setPosts((curr) => [...curr, ...newPage]);

    const last = newPage[newPage.length - 1];
    const lastTs = last?.createdAt?.toMillis
      ? last.createdAt.toMillis()
      : last?.createdAt?.seconds
      ? last.createdAt.seconds * 1000
      : null;
    lastCursorRef.current = lastTs;
    setHasMore(nextBatch.length > newPage.length);
  }, [me, posts, hasMore]); // eslint-disable-line

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const decoratedPosts = useMemo(() => {
    return posts.map((p) => ({
      ...p,
      authorName: userCache[p.userId]?.name || "Unknown",
      authorPhoto: userCache[p.userId]?.photo || "https://i.imgur.com/qzsiOuh.png",
    }));
  }, [posts, userCache]);

  /* ----- post creation (must match your rules) ----- */
  const createPost = async ({ userId, text, image }) => {
    await addDoc(collection(db, "Posts"), {
      userId,
      text,
      image: image || "",          // rules require field to exist
      createdAt: serverTimestamp(),
      likes: [],                   // rules require list
    });
    // Refresh the feed head quickly
    await loadInitial();
  };

  /* ----- like toggle that satisfies your 'likes-only' rule ----- */
  const toggleLike = async (post) => {
    const pid = post.id;
    const ref = doc(db, "Posts", pid);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const likes = Array.isArray(data.likes) ? [...data.likes] : [];
      const i = likes.indexOf(me);
      if (i >= 0) likes.splice(i, 1);
      else likes.push(me);

      // Update only the 'likes' field (your rules validate diff + list semantics)
      await updateDoc(ref, { likes });
      // reflect locally for snappy UI
      setPosts((curr) =>
        curr.map((p) => (p.id === pid ? { ...p, likes } : p))
      );
    } catch (e) {
      console.error("like toggle failed:", e);
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* composer */}
      <Composer onPost={createPost} />

      {/* posts */}
      {loading && <div style={{ color: "#94a3b8" }}>Loading feed…</div>}

      {!loading && decoratedPosts.length === 0 && (
        <div style={{ color: "#94a3b8" }}>No posts yet. Say hi with your first post!</div>
      )}

      {!loading &&
        decoratedPosts.map((p) => (
          <PostCard key={p.id} post={p} currentUid={me} onToggleLike={toggleLike} />
        ))}

      {!loading && hasMore && (
        <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
          <button className="btn btn-ghost" onClick={loadMore}>Load more</button>
        </div>
      )}
    </div>
  );
}
