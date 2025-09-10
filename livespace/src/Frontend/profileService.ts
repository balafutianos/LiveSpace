// src/services/profileService.ts
import { doc, getDoc, setDoc, deleteField } from "firebase/firestore";
import { db } from "../Frontend/firebase";

type Visibility = "public" | "private";
const FIELDS = ["phone", "phoneCountry", "phoneNumber", "sex", "birthday", "work", "city", "about", "email"] as const;
type FieldName = typeof FIELDS[number];
const isPrivate = (vis: Record<string, Visibility> | undefined, f: FieldName) =>
  (vis?.[f] || "public") === "private";

// Owner gets public+private; others only public
export async function getProfileForViewer(uid: string, viewerUid?: string) {
  const pub = await getDoc(doc(db, "Users", uid));
  const publicData = pub.exists() ? pub.data() : {};
  if (viewerUid && viewerUid === uid) {
    const priv = await getDoc(doc(db, "Users", uid, "private", "profile"));
    const privateData = priv.exists() ? priv.data() : {};
    return { ...publicData, ...privateData, visibility: publicData.visibility || {} };
  }
  return publicData;
}

// Split write + delete from the opposite doc
export async function saveProfile(uid: string, form: any) {
  const vis: Record<string, Visibility> = form.visibility || {};
  const publicUpdate: any = { visibility: vis };
  const privateUpdate: any = {};

  for (const f of FIELDS) {
    const v = form[f] ?? null;
    if (isPrivate(vis, f)) {
      privateUpdate[f] = v;
      publicUpdate[f] = deleteField();
    } else {
      publicUpdate[f] = v;
      privateUpdate[f] = deleteField();
    }
  }
  await setDoc(doc(db, "Users", uid), publicUpdate, { merge: true });
  await setDoc(doc(db, "Users", uid, "private", "profile"), privateUpdate, { merge: true });
}
