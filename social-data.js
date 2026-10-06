import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { app } from "./firebase-auth.js";

export const db = getFirestore(app);

export const getUserProfile = async (uid) => {
  const profile = await getDoc(doc(db, "profiles", uid));
  return profile.exists() ? profile.data() : null;
};

export const getDisplayName = async (user) => {
  const profile = await getUserProfile(user.uid);
  return profile?.displayName || user.displayName || "Googleユーザー";
};
