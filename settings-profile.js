import { doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from "./firebase-auth.js";
import { db, getUserProfile } from "./social-data.js";

const form = document.getElementById("profile-settings-form");
const usernameInput = document.getElementById("profile-username");
const displayNameInput = document.getElementById("profile-display-name");
const bioInput = document.getElementById("profile-bio");
const saveButton = document.getElementById("profile-save-button");
const status = document.getElementById("profile-status");
const saveState = document.getElementById("profile-save-state");
let currentUser = null;
let saving = false;

const setStatus = (message, error = false) => {
  status.textContent = message;
  status.dataset.state = error ? "error" : "info";
  saveState.lastChild.textContent = ` ${error ? "エラー" : saving ? "保存中" : "保存可能"}`;
};

const defaultUsername = (user) => {
  const base = (user.email?.split("@")[0] || user.uid.slice(0, 12))
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 20);
  return base.length >= 3 ? base : `user_${base}`.slice(0, 24);
};

const setFormEnabled = (enabled) => {
  [usernameInput, displayNameInput, bioInput].forEach((field) => {
    field.disabled = !enabled;
  });
  saveButton.disabled = !enabled || saving;
};

const firestoreMessage = (error) => {
  if (error.code === "permission-denied") return "プロフィールを保存できません。Firebase ConsoleへFirestoreルールを公開してください。";
  if (error.code === "unavailable") return "Firebaseへ接続できません。ネットワークを確認してください。";
  if (error.code === "already-exists") return "そのユーザー名はすでに使用されています。別の名前を選んでください。";
  return `プロフィールを保存できませんでした（${error.code || "unknown"}）。`;
};

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  setFormEnabled(Boolean(user));
  if (!user) {
    setStatus("Googleログインするとプロフィールを保存できます。");
    saveState.lastChild.textContent = " ログインが必要です";
    return;
  }

  try {
    const profile = await getUserProfile(user.uid);
    const avatarPreview = document.getElementById("avatar-preview");
    if (user.photoURL) {
      const image = document.createElement("img");
      image.src = user.photoURL;
      image.alt = "";
      avatarPreview.replaceChildren(image);
    } else {
      avatarPreview.textContent = (user.displayName || "K").trim().charAt(0).toUpperCase() || "K";
    }
    usernameInput.value = profile?.username || defaultUsername(user);
    displayNameInput.value = profile?.displayName || user.displayName || "";
    bioInput.value = profile?.bio || "";
    setStatus(profile ? "プロフィールを読み込みました。" : "ユーザー名を確認してプロフィールを保存してください。");
  } catch (error) {
    setStatus(firestoreMessage(error), true);
  }
}, (error) => {
  setStatus(`認証状態を確認できませんでした（${error.code || "unknown"}）。`, true);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || saving) return;
  if (!form.reportValidity()) return;

  const username = usernameInput.value.trim().toLowerCase();
  const displayName = displayNameInput.value.trim();
  const bio = bioInput.value.trim();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    setStatus("ユーザー名は英小文字・数字・_ の3〜24文字で入力してください。", true);
    return;
  }
  if (!displayName || displayName.length > 40 || bio.length > 160) {
    setStatus("表示名は1〜40文字、自己紹介は160文字以内で入力してください。", true);
    return;
  }

  saving = true;
  saveButton.disabled = true;
  saveState.lastChild.textContent = " 保存中";
  setStatus("プロフィールを保存しています…");
  try {
    await runTransaction(db, async (transaction) => {
      const profileRef = doc(db, "profiles", currentUser.uid);
      const nextUsernameRef = doc(db, "usernames", username);
      const profileSnapshot = await transaction.get(profileRef);
      const oldUsername = profileSnapshot.data()?.username;
      const oldUsernameRef = oldUsername ? doc(db, "usernames", oldUsername) : null;
      const [usernameSnapshot, oldUsernameSnapshot] = await Promise.all([
        transaction.get(nextUsernameRef),
        oldUsernameRef && oldUsername !== username ? transaction.get(oldUsernameRef) : Promise.resolve(null),
      ]);
      if (usernameSnapshot.exists() && usernameSnapshot.data().uid !== currentUser.uid) {
        const error = new Error("Username is already in use.");
        error.code = "already-exists";
        throw error;
      }
      if (!usernameSnapshot.exists()) transaction.set(nextUsernameRef, { uid: currentUser.uid });
      if (oldUsernameRef && oldUsername !== username && oldUsernameSnapshot?.data()?.uid === currentUser.uid) {
        transaction.delete(oldUsernameRef);
      }
      transaction.set(profileRef, {
        username,
        displayName,
        bio,
        updatedAt: serverTimestamp(),
      });
    });
    setStatus("プロフィールを保存しました。");
  } catch (error) {
    setStatus(firestoreMessage(error), true);
  } finally {
    saving = false;
    saveButton.disabled = !currentUser;
    if (currentUser && !status.dataset.state?.includes("error")) {
      saveState.lastChild.textContent = " 保存済み";
    }
  }
});
