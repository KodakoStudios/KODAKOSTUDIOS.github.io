import { collection, collectionGroup, doc, limit, onSnapshot, query, runTransaction, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from "./firebase-auth.js";
import { db, getProfileAvatarId, getUserProfile, PROFILE_AVATARS } from "./social-data.js";

const form = document.getElementById("profile-settings-form");
const usernameInput = document.getElementById("profile-username");
const displayNameInput = document.getElementById("profile-display-name");
const bioInput = document.getElementById("profile-bio");
const avatarInputs = [...document.querySelectorAll('input[name="profile-avatar"]')];
const saveButton = document.getElementById("profile-save-button");
const status = document.getElementById("profile-status");
const saveState = document.getElementById("profile-save-state");
let currentUser = null;
let saving = false;
let historyUnsubscribers = [];
let postEntries = new Map();
let replyEntries = new Map();
const postsStatus = document.getElementById("profile-posts-status");
const postsHistory = document.getElementById("profile-post-history");

const renderHistoryItem = ({ id, postId, data, kind: entryKind }) => {
  const article = document.createElement("article");
  article.className = "profile-history-item";
  const heading = document.createElement("div");
  heading.className = "profile-history-heading";
  const kind = document.createElement("strong");
  kind.textContent = entryKind === "reply" ? "返信" : data.type === "art" ? "ファンアート" : data.type === "video" ? "ファンビデオ" : "テキスト投稿";
  const date = document.createElement("time");
  if (data.createdAt?.toDate) {
    const createdAt = data.createdAt.toDate();
    date.dateTime = createdAt.toISOString();
    date.textContent = createdAt.toLocaleString("ja-JP");
  } else {
    date.textContent = "投稿したばかり";
  }
  heading.append(kind, date);
  article.append(heading);
  if (data.content) {
    const content = document.createElement("p");
    content.textContent = data.content;
    article.append(content);
  }
  const link = document.createElement("a");
  link.href = `fan-community.html#post-${encodeURIComponent(postId || id)}`;
  link.textContent = entryKind === "reply" ? "返信先の投稿を見る" : "ファン広場で見る";
  article.append(link);
  return article;
};

const loadPostHistory = (user) => {
  historyUnsubscribers.forEach((unsubscribe) => unsubscribe());
  historyUnsubscribers = [];
  postEntries = new Map();
  replyEntries = new Map();
  postsHistory.replaceChildren();
  if (!user) {
    postsStatus.textContent = "Googleログインすると投稿履歴を表示します。";
    return;
  }
  postsStatus.textContent = "投稿履歴を読み込んでいます…";
  let postSnapshotReady = false;
  let replySnapshotReady = false;
  let historyError = null;
  const renderHistory = () => {
    if (historyError) {
      postsStatus.textContent = historyError.code === "permission-denied"
        ? "投稿・返信履歴を読み込めません。Firebase Consoleへ最新のFirestoreルールを公開してください。"
        : `投稿・返信履歴を読み込めませんでした（${historyError.code || "unknown"}）。`;
      postsStatus.dataset.state = "error";
      return;
    }
    if (!postSnapshotReady || !replySnapshotReady) return;
    const entries = [
      ...[...postEntries.values()].map((entry) => ({ ...entry, kind: "post" })),
      ...[...replyEntries.values()].map((entry) => ({ ...entry, kind: "reply" })),
    ].sort((a, b) => (b.data.createdAt?.toMillis?.() || 0) - (a.data.createdAt?.toMillis?.() || 0)).slice(0, 100);
    postsHistory.replaceChildren(...entries.map(renderHistoryItem));
    postsStatus.textContent = entries.length
      ? `${entries.length}件の投稿・返信を表示しています（最大100件）。`
      : "まだ投稿・返信はありません。ファン広場から投稿できます。";
    postsStatus.dataset.state = "info";
  };
  historyUnsubscribers.push(onSnapshot(
    query(collection(db, "communityPosts"), where("uid", "==", user.uid), limit(100)),
    (snapshot) => {
      postEntries = new Map(snapshot.docs.map((item) => [item.id, {
        id: item.id,
        postId: item.id,
        data: item.data(),
      }]));
      postSnapshotReady = true;
      renderHistory();
    },
    (error) => {
      historyError = error;
      renderHistory();
    },
  ));
  historyUnsubscribers.push(onSnapshot(
    query(collectionGroup(db, "replies"), where("uid", "==", user.uid), limit(100)),
    (snapshot) => {
      replyEntries = new Map(snapshot.docs.map((item) => [`${item.ref.parent.parent?.id}:${item.id}`, {
        id: item.id,
        postId: item.ref.parent.parent?.id,
        data: item.data(),
      }]));
      replySnapshotReady = true;
      renderHistory();
    },
    (error) => {
      historyError = error;
      renderHistory();
    },
  ));
};

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
  [usernameInput, displayNameInput, bioInput, ...avatarInputs].forEach((field) => {
    field.disabled = !enabled;
  });
  saveButton.disabled = !enabled || saving;
};

const renderAvatarPreview = (avatarId, user) => {
  const avatarPreview = document.getElementById("avatar-preview");
  avatarPreview.replaceChildren();
  if (avatarId === "google" && user.photoURL) {
    const image = document.createElement("img");
    image.src = user.photoURL;
    image.alt = "";
    avatarPreview.append(image);
    return;
  }
  avatarPreview.textContent = PROFILE_AVATARS[avatarId] || (user.displayName || "K").trim().charAt(0).toUpperCase() || "K";
};

const selectedAvatarId = () => avatarInputs.find((input) => input.checked)?.value || "google";

avatarInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (currentUser) renderAvatarPreview(input.value, currentUser);
  });
});

const firestoreMessage = (error) => {
  if (error.code === "permission-denied") return "プロフィールを保存できません。Firebase ConsoleへFirestoreルールを公開してください。";
  if (error.code === "unavailable") return "Firebaseへ接続できません。ネットワークを確認してください。";
  if (error.code === "already-exists") return "そのユーザー名はすでに使用されています。別の名前を選んでください。";
  return `プロフィールを保存できませんでした（${error.code || "unknown"}）。`;
};

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  loadPostHistory(user);
  setFormEnabled(Boolean(user));
  if (!user) {
    setStatus("Googleログインするとプロフィールを保存できます。");
    saveState.lastChild.textContent = " ログインが必要です";
    return;
  }

  try {
    const profile = await getUserProfile(user.uid);
    const avatarId = getProfileAvatarId(profile);
    avatarInputs.forEach((input) => {
      input.checked = input.value === avatarId;
    });
    renderAvatarPreview(avatarId, user);
    usernameInput.value = profile?.username || defaultUsername(user);
    displayNameInput.value = profile?.displayName || user.displayName || "";
    bioInput.value = profile?.bio || "";
    setStatus(profile ? "プロフィールを読み込みました。" : "ユーザー名を確認してプロフィールを保存してください。");
  } catch (error) {
    setStatus(firestoreMessage(error), true);
  }
}, (error) => {
  setStatus(`認証状態を確認できませんでした（${error.code || "unknown"}）。`, true);
  postsStatus.textContent = `投稿履歴の認証状態を確認できませんでした（${error.code || "unknown"}）。`;
});

window.addEventListener("pagehide", () => {
  historyUnsubscribers.forEach((unsubscribe) => unsubscribe());
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || saving) return;
  if (!form.reportValidity()) return;

  const username = usernameInput.value.trim().toLowerCase();
  const displayName = displayNameInput.value.trim();
  const bio = bioInput.value.trim();
  const avatarId = selectedAvatarId();
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
        avatarId,
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
