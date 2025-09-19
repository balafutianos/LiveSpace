// src/Frontend/Events.jsx
import React, { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  setDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "./firebase";
import "./Events.css";

const FALLBACK = "https://i.imgur.com/qzsiOuh.png";

/* ---------- mini user helpers ---------- */
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
          setMini({ id: uid, name, photo });
        } else {
          setMini({ id: uid, name: "Someone", photo: FALLBACK });
        }
      } catch {
        setMini({ id: uid, name: "Someone", photo: FALLBACK });
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid]);
  return mini;
}

function useAcceptedFriendIds(uid) {
  const [ids, setIds] = useState([]);
  useEffect(() => {
    if (!uid) return;
    const refFR = collection(db, "FriendRequests");
    const qFrom = query(refFR, where("fromId", "==", uid), where("status", "==", "accepted"));
    const qTo = query(refFR, where("toId", "==", uid), where("status", "==", "accepted"));
    let A = [], B = [];
    const merge = () => {
      const s = new Set();
      A.forEach((d) => s.add(d.toId));
      B.forEach((d) => s.add(d.fromId));
      setIds(Array.from(s));
    };
    const u1 = onSnapshot(qFrom, (snap) => {
      A = snap.docs.map((d) => d.data());
      merge();
    });
    const u2 = onSnapshot(qTo, (snap) => {
      B = snap.docs.map((d) => d.data());
      merge();
    });
    return () => {
      u1();
      u2();
    };
  }, [uid]);
  return ids;
}

/* ---------- small UI bits ---------- */
function FriendPill({ uid, selected, onToggle }) {
  const mini = useMiniUser(uid);
  if (!mini) return null;
  const on = selected.includes(uid);
  return (
    <button
      type="button"
      className={`fp-pill ${on ? "on" : ""}`}
      onClick={() => onToggle(uid)}
      title={mini.name}
    >
      <img src={mini.photo} alt="" />
      <span className="fp-name">{mini.name}</span>
      {on && <span className="fp-check">✔</span>}
    </button>
  );
}
function MiniAvatar({ uid }) {
  const mini = useMiniUser(uid);
  return (
    <div className="mini-avatar" title={mini?.name || "Someone"}>
      <img src={mini?.photo || FALLBACK} alt="" />
    </div>
  );
}
function MiniName({ uid }) {
  const mini = useMiniUser(uid);
  return <>{mini?.name || "Someone"}</>;
}

/* ============================== PAGE ============================== */
export default function Events() {
  const uid = auth.currentUser?.uid || null;

  // form state
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [eventImageFile, setEventImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [attendees, setAttendees] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // lists
  const [organizing, setOrganizing] = useState([]);
  const [invited, setInvited] = useState([]);

  const friendIds = useAcceptedFriendIds(uid);

  /* live queries */
  useEffect(() => {
    if (!uid) return;
    const qOrg = query(
      collection(db, "Events"),
      where("organizerId", "==", uid),
      orderBy("startAt", "asc")
    );
    const unsub = onSnapshot(qOrg, (snap) =>
      setOrganizing(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const qInv = query(
      collection(db, "Events"),
      where("attendees", "array-contains", uid),
      orderBy("startAt", "asc")
    );
    const unsub = onSnapshot(qInv, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() })) // ← fixed stray brace from previous version
        .filter((e) => e.organizerId !== uid);
      setInvited(list);
    });
    return unsub;
  }, [uid]);

  const toggleAttendee = (fid) =>
    setAttendees((prev) => (prev.includes(fid) ? prev.filter((x) => x !== fid) : [...prev, fid]));

  const resetForm = () => {
    setTitle("");
    setDesc("");
    setDate("");
    setVisibility("public");
    setEventImageFile(null);
    setImagePreview("");
    setAttendees([]);
    setEditingId(null);
    setSaving(false);
  };

  async function uploadEventImage(file) {
    if (!file) return "";
    const path = `events/${uid}_${Date.now()}`;
    const r = ref(storage, path);
    await uploadBytes(r, file);
    return await getDownloadURL(r);
  }

  // single helper to create a linked post that your feed can render as an "event card"
  async function createPublicPostForEvent(evId, evTitle, startAt, imageUrl) {
    try {
      const postRef = doc(collection(db, "Posts"));
      await setDoc(postRef, {
        userId: uid,
        postType: "event",
        eventId: evId,
        text: "",
        image: imageUrl || "",
        createdAt: new Date(),
        likes: [],
      });
    } catch (e) {
      console.warn("createPublicPostForEvent failed (non-fatal):", e);
    }
  }

  const createEvent = async () => {
    if (!uid || !title || !date) return;
    setSaving(true);
    try {
      const startAt = new Date(date);
      if (isNaN(startAt.getTime())) {
        setSaving(false);
        return;
      }

      let imageUrl = "";
      if (eventImageFile) imageUrl = await uploadEventImage(eventImageFile);

      const docRef = await addDoc(collection(db, "Events"), {
        organizerId: uid,
        title,
        description: desc,
        startAt,
        attendees,
        visibility, // 'public' | 'private'
        imageUrl, // cover image
        going: [],
        notGoing: [],
        createdAt: serverTimestamp(),
      });

      if (visibility === "public") {
        await createPublicPostForEvent(docRef.id, title, startAt, imageUrl);
      }

      resetForm();
    } catch (e) {
      console.error("createEvent error:", e);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (ev) => {
    setEditingId(ev.id);
    setTitle(ev.title || "");
    setDesc(ev.description || "");
    setDate(ev.startAt?.toDate ? ev.startAt.toDate().toISOString().slice(0, 16) : "");
    setVisibility(ev.visibility || "public");
    setAttendees(Array.isArray(ev.attendees) ? ev.attendees : []);
    setImagePreview(ev.imageUrl || "");
    setEventImageFile(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      setSaving(true);
      let newImageUrl = imagePreview || "";
      if (eventImageFile) newImageUrl = await uploadEventImage(eventImageFile);

      await updateDoc(doc(db, "Events", editingId), {
        title,
        description: desc,
        startAt: new Date(date),
        attendees,
        visibility,
        imageUrl: newImageUrl,
        updatedAt: serverTimestamp(),
      });
      resetForm();
    } catch (e) {
      console.error("saveEdit error:", e);
      setSaving(false);
    }
  };

  const removeEvent = async (id) => {
    try {
      await deleteDoc(doc(db, "Events", id));
      if (id === editingId) resetForm();
    } catch (e) {
      console.error("removeEvent error:", e);
    }
  };

  // RSVP
  const rsvpGoing = async (id) => {
    if (!uid || !id) return;
    try {
      await updateDoc(doc(db, "Events", id), {
        going: arrayUnion(uid),
        notGoing: arrayRemove(uid),
      });
    } catch (e) {
      console.error("RSVP going error:", e);
    }
  };
  const rsvpNotGoing = async (id) => {
    if (!uid || !id) return;
    try {
      await updateDoc(doc(db, "Events", id), {
        notGoing: arrayUnion(uid),
        going: arrayRemove(uid),
      });
    } catch (e) {
      console.error("RSVP not going error:", e);
    }
  };

  /* ---------- Event list card ---------- */
  const EventCard = ({ ev, manage }) => {
    const imOrganizer = ev.organizerId === uid;
    const isInvitee = Array.isArray(ev.attendees) && ev.attendees.includes(uid);

    return (
      <li className="event-row">
        <div className="event-media">
          {ev.imageUrl ? (
            <img className="event-cover" src={ev.imageUrl} alt="" />
          ) : (
            <div className="event-cover placeholder">No image</div>
          )}
        </div>

        <div className="event-main">
          <div className="event-title">
            {ev.title}{" "}
            {manage ? null : <span className="pill">{isInvitee ? "Invite" : ev.visibility}</span>}
          </div>

          <div className="event-desc">{ev.description}</div>

          <div className="event-meta">
            {ev.startAt?.toDate ? ev.startAt.toDate().toLocaleString() : ""}
          </div>

          <div className="event-meta">
            Organizer: <strong><MiniName uid={ev.organizerId} /></strong>
          </div>

          {Array.isArray(ev.attendees) && ev.attendees.length > 0 && (
            <div className="event-meta">
              With:{" "}
              {ev.attendees.map((id, i) => (
                <span key={id}>
                  <MiniName uid={id} />
                  {i < ev.attendees.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>
          )}

          {Array.isArray(ev.going) && ev.going.length > 0 && (
            <div className="event-going">
              <div className="eg-label">Going:</div>
              <div className="eg-avatars">
                {ev.going.map((id) => (
                  <MiniAvatar key={id} uid={id} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="event-actions">
          {manage && imOrganizer && (
            <>
              <button className="btn btn-ghost" onClick={() => startEdit(ev)}>Edit</button>
              <button className="btn btn-ghost danger" onClick={() => removeEvent(ev.id)}>
                Delete
              </button>
            </>
          )}

          {!manage && (
            <>
              <button className="btn btn-primary" onClick={() => rsvpGoing(ev.id)}>Going</button>
              <button className="btn btn-ghost" onClick={() => rsvpNotGoing(ev.id)}>Not going</button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="events-page">
      <h2 className="events-title">Events</h2>

      {/* Create / Edit form */}
      <div className="events-form">
        <input
          type="text"
          placeholder="Event title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          placeholder="Description"
          rows={3}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />

        <input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        {/* Image picker */}
        <div className="ev-imgu">
          <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
            {imagePreview ? "Replace image" : "Add image"}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setEventImageFile(f);
                  setImagePreview(URL.createObjectURL(f));
                }
              }}
            />
          </label>
          {imagePreview && (
            <div className="ev-img-preview">
              <img src={imagePreview} alt="preview" />
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setEventImageFile(null);
                  setImagePreview("");
                }}
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {/* Friend picker */}
        <div className="fp-wrap">
          <div className="fp-label">Tag friends</div>
          <div className="fp-grid">
            {friendIds.length === 0 && <div className="fp-empty">No friends yet.</div>}
            {friendIds.map((fid) => (
              <FriendPill
                key={fid}
                uid={fid}
                selected={attendees}
                onToggle={toggleAttendee}
              />
            ))}
          </div>
        </div>

        <div className="row">
          <label className="ev-vis-lbl">
            Visibility:
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </label>

          <div className="ev-actions">
            {editingId ? (
              <>
                <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button className="btn btn-ghost" onClick={resetForm} disabled={saving}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={createEvent} disabled={saving}>
                {saving ? "Creating…" : "Create event"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Organizer section */}
      <section className="ev-sec">
        <h3 className="ev-h3">Organizing</h3>
        {organizing.length === 0 && <div className="muted">No events yet.</div>}
        <ul className="events-list">
          {organizing.map((ev) => (
            <EventCard key={ev.id} ev={ev} manage />
          ))}
        </ul>
      </section>

      {/* Invited section */}
      <section className="ev-sec">
        <h3 className="ev-h3">Invited</h3>
        {invited.length === 0 && <div className="muted">No invites.</div>}
        <ul className="events-list">
          {invited.map((ev) => (
            <EventCard key={ev.id} ev={ev} />
          ))}
        </ul>
      </section>
    </div>
  );
}
