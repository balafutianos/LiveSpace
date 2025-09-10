// src/services/profileService.ts
import { getDoc, doc, setDoc } from "firebase/firestore";
import { db } from "./firebase"; // your Firebase init

// Fetch profile for viewer (owner gets private merged in)
export async function getProfileForViewer(uid: string, viewerUid?: string) {
  const publicSnap = await getDoc(doc(db, "Users", uid));
  const publicData = publicSnap.exists() ? publicSnap.data() : {};

  if (viewerUid && viewerUid === uid) {
    const privateSnap = await getDoc(doc(db, "Users", uid, "private", "profile"));
    const privateData = privateSnap.exists() ? privateSnap.data() : {};
    return { ...publicData, ...privateData };
  }

  return publicData;
}

// Save profile, splitting into public/private docs
export async function saveProfile(uid: string, form: any) {
  const vis = form.visibility || {};
  const isPrivate = (field: string) => (vis[field] || "public") === "private";

  const publicData: any = {
    firstName: form.firstName ?? null,
    lastName:  form.lastName  ?? null,
    avatarUrl: form.avatarUrl ?? null,
    city:     !isPrivate("city") ? form.city ?? null : null,
    about:    !isPrivate("about") ? form.about ?? null : null,
    work:     !isPrivate("work") ? form.work ?? null : null,
    sex:      !isPrivate("sex") ? form.sex ?? null : null,
    birthday: !isPrivate("birthday") ? form.birthday ?? null : null,
    email:    !isPrivate("email") ? form.email ?? null : null,
    visibility: vis,
  };

  const privateData: any = {
    phoneCountry: isPrivate("phone") ? form.phoneCountry ?? null : null,
    phoneNumber:  isPrivate("phone") ? form.phoneNumber ?? null : null,
    city:     isPrivate("city") ? form.city ?? null : null,
    about:    isPrivate("about") ? form.about ?? null : null,
    work:     isPrivate("work") ? form.work ?? null : null,
    sex:      isPrivate("sex") ? form.sex ?? null : null,
    birthday: isPrivate("birthday") ? form.birthday ?? null : null,
    email:    isPrivate("email") ? form.email ?? null : null,
  };

  const prune = (obj: any) => {
    const out: any = {};
    Object.entries(obj).forEach(([k, v]) => {
      if (v !== undefined && v !== null) out[k] = v;
    });
    return out;
  };

  const publicRef  = doc(db, "Users", uid);
  const privateRef = doc(db, "Users", uid, "private", "profile");

  await setDoc(publicRef, prune(publicData), { merge: true });
  await setDoc(privateRef, prune(privateData), { merge: true });
}
