import { collection, collectionGroup, doc, limit, onSnapshot, query, runTransaction, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from "./firebase-auth.js";
import { db, getProfileAvatarId, getUserProfile, PROFILE_AVATARS } from "./social-data.js";

const DEBUG_OWNER_UID = "f1Xr5FotQSVnuDx7nPMHzsNRwPy2";
const form = document.getElementById("profile-settings-form");
const usernameInput = document.getElementById("profile-username");
const displayNameInput = document.getElementById("profile-display-name");
const bioInput = document.getElementById("profile-bio");
const avatarInputs = [...document.querySelectorAll('input[name="profile-avatar"]')];
const avatarFileInput = document.getElementById("avatar-file-input");
const cropper = document.getElementById("avatar-cropper");
const cropImage = document.getElementById("avatar-crop-image");
const cropWindow = document.querySelector(".avatar-crop-window");
const cropZoom = document.getElementById("avatar-crop-zoom");
const cropX = document.getElementById("avatar-crop-x");
const cropY = document.getElementById("avatar-crop-y");
const cropApply = document.getElementById("avatar-crop-apply");
const cropCancel = document.getElementById("avatar-crop-cancel");
const customAvatarChoice = document.getElementById("avatar-custom-choice");
const saveButton = document.getElementById("profile-save-button");
const status = document.getElementById("profile-status");
const saveState = document.getElementById("profile-save-state");
let currentUser = null;
let saving = false;
let historyUnsubscribers = [];
let postEntries = new Map();
let replyEntries = new Map();
let cropObjectUrl = "";
let savedCustomAvatarDataUrl = "";
let pendingCustomAvatarDataUrl = "";
const postsStatus = document.getElementById("profile-posts-status");
const postsHistory = document.getElementById("profile-post-history");
const debugPanel = document.getElementById("debug-panel");
const debugUidCheck = document.getElementById("debug-uid-check");
const debugPostHistory = document.getElementById("debug-post-history");
const debugReplyHistory = document.getElementById("debug-reply-history");
const debugHistoryError = document.getElementById("debug-history-error");

const updateDebugIdentity = (user) => {
  const allowed = Boolean(user && user.uid === DEBUG_OWNER_UID);
  debugPanel.hidden = !allowed;
  if (!allowed) return;
  debugUidCheck.textContent = `ログインUID: ${user.uid}（許可UIDと一致）`;
};

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
    updateDebugIdentity(user);
    return;
  }
  postsStatus.textContent = "投稿履歴を読み込んでいます…";
  let postQueryError = null;
  let replyQueryError = null;
  debugPostHistory.textContent = "投稿履歴: 読み込み中";
  debugReplyHistory.textContent = "返信履歴: 読み込み中";
  debugHistoryError.hidden = true;
  let postSnapshotReady = false;
  let replySnapshotReady = false;
  const renderHistory = () => {
    const historyError = postQueryError || replyQueryError;
    debugPostHistory.textContent = `投稿履歴: ${postQueryError ? `エラー ${postQueryError.code || "unknown"}` : postSnapshotReady ? `${postEntries.size}件取得` : "読み込み中"}`;
    debugReplyHistory.textContent = `返信履歴: ${replyQueryError ? `エラー ${replyQueryError.code || "unknown"}` : replySnapshotReady ? `${replyEntries.size}件取得` : "読み込み中"}`;
    if (historyError) {
      debugHistoryError.textContent = historyError.message || historyError.code || "エラー詳細なし";
      debugHistoryError.hidden = false;
      postsStatus.textContent = historyError.code === "permission-denied"
        ? "履歴の読み取りが拒否されました。サイト管理者に履歴の閲覧権限を確認してください。"
        : historyError.code === "failed-precondition"
          ? "履歴検索の設定が不足しています。管理者が履歴用インデックスを追加して公開した後、ページを再読み込みしてください。"
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
      postQueryError = null;
      postEntries = new Map(snapshot.docs.map((item) => [item.id, {
        id: item.id,
        postId: item.id,
        data: item.data(),
      }]));
      postSnapshotReady = true;
      renderHistory();
    },
    (error) => {
      postQueryError = error;
      console.error("Post history query failed:", error);
      renderHistory();
    },
  ));
  historyUnsubscribers.push(onSnapshot(
    query(collectionGroup(db, "replies"), where("uid", "==", user.uid), limit(100)),
    (snapshot) => {
      replyQueryError = null;
      replyEntries = new Map(snapshot.docs.map((item) => [`${item.ref.parent.parent?.id}:${item.id}`, {
        id: item.id,
        postId: item.ref.parent.parent?.id,
        data: item.data(),
      }]));
      replySnapshotReady = true;
      renderHistory();
    },
    (error) => {
      replyQueryError = error;
      console.error("Reply history query failed:", error);
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
  [usernameInput, displayNameInput, bioInput, avatarFileInput, ...avatarInputs].forEach((field) => {
    field.disabled = !enabled;
  });
  saveButton.disabled = !enabled || saving;
};

const renderAvatarPreview = (avatarId, user) => {
  const avatarPreview = document.getElementById("avatar-preview");
  avatarPreview.replaceChildren();
  const customImage = pendingCustomAvatarDataUrl || savedCustomAvatarDataUrl;
  if (avatarId === "custom" && customImage) {
    const image = document.createElement("img");
    image.src = customImage;
    image.alt = "";
    avatarPreview.append(image);
    customAvatarChoice.replaceChildren(image.cloneNode());
    return;
  }
  customAvatarChoice.textContent = "画像";
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

const closeCropper = () => {
  cropper.hidden = true;
  cropImage.removeAttribute("src");
  if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
  cropObjectUrl = "";
  avatarFileInput.value = "";
};

const updateCropPreview = () => {
  if (!cropImage.naturalWidth || !cropImage.naturalHeight) return;
  const size = Math.min(cropImage.naturalWidth, cropImage.naturalHeight) / Number(cropZoom.value);
  const left = (cropImage.naturalWidth - size) * (Number(cropX.value) + 100) / 200;
  const top = (cropImage.naturalHeight - size) * (Number(cropY.value) + 100) / 200;
  const scale = cropWindow.clientWidth / size;
  cropImage.style.width = `${cropImage.naturalWidth * scale}px`;
  cropImage.style.height = `${cropImage.naturalHeight * scale}px`;
  cropImage.style.left = `${-left * scale}px`;
  cropImage.style.top = `${-top * scale}px`;
};

avatarFileInput.addEventListener("change", async () => {
  const file = avatarFileInput.files?.[0];
  if (!file) return;
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    setStatus("PNGまたはJPG画像を選択してください。", true);
    avatarFileInput.value = "";
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    setStatus("元画像は15MB以下のPNG/JPGを選択してください。", true);
    avatarFileInput.value = "";
    return;
  }
  closeCropper();
  cropObjectUrl = URL.createObjectURL(file);
  cropImage.src = cropObjectUrl;
  try {
    await cropImage.decode();
    if (cropImage.naturalWidth * cropImage.naturalHeight > 50000000) {
      closeCropper();
      setStatus("画像の解像度が大きすぎます。別の画像を選んでください。", true);
      return;
    }
    cropZoom.value = "1";
    cropX.value = "0";
    cropY.value = "0";
    cropper.hidden = false;
    requestAnimationFrame(updateCropPreview);
    setStatus("切り抜く範囲を調整し、「この範囲をアイコンにする」を押してください。");
  } catch {
    closeCropper();
    setStatus("画像を読み込めませんでした。破損していないPNG/JPGか確認してください。", true);
  }
});

[cropZoom, cropX, cropY].forEach((input) => input.addEventListener("input", updateCropPreview));
window.addEventListener("resize", updateCropPreview);
cropCancel.addEventListener("click", closeCropper);
cropApply.addEventListener("click", () => {
  const cropSize = Math.min(cropImage.naturalWidth, cropImage.naturalHeight) / Number(cropZoom.value);
  const sourceX = (cropImage.naturalWidth - cropSize) * (Number(cropX.value) + 100) / 200;
  const sourceY = (cropImage.naturalHeight - cropSize) * (Number(cropY.value) + 100) / 200;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    setStatus("画像を加工できませんでした。このブラウザーではCanvasが利用できません。", true);
    return;
  }
  context.drawImage(cropImage, sourceX, sourceY, cropSize, cropSize, 0, 0, 256, 256);
  let result = "";
  for (const quality of [0.86, 0.72, 0.58, 0.46]) {
    result = canvas.toDataURL("image/jpeg", quality);
    if (result.length <= 280000) break;
  }
  if (!result || result.length > 280000) {
    setStatus("画像を十分に圧縮できませんでした。別の画像をお試しください。", true);
    return;
  }
  pendingCustomAvatarDataUrl = result;
  avatarInputs.forEach((input) => {
    input.checked = input.value === "custom";
  });
  renderAvatarPreview("custom", currentUser);
  closeCropper();
  setStatus("切り抜いたアイコンを準備しました。プロフィールを保存すると反映されます。");
});

avatarInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (currentUser) renderAvatarPreview(input.value, currentUser);
  });
});

const firestoreMessage = (error) => {
  if (error.code === "permission-denied") return "プロフィールを保存できません。サイトの保存権限を確認してください。";
  if (error.code === "unavailable") return "サイトの保存機能に接続できません。ネットワークを確認してください。";
  if (error.code === "already-exists") return "そのユーザー名はすでに使用されています。別の名前を選んでください。";
  return `プロフィールを保存できませんでした（${error.code || "unknown"}）。`;
};

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  updateDebugIdentity(user);
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
    savedCustomAvatarDataUrl = profile?.customAvatarDataUrl || "";
    pendingCustomAvatarDataUrl = "";
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
  closeCropper();
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
  const customAvatarDataUrl = pendingCustomAvatarDataUrl || savedCustomAvatarDataUrl;
  if (avatarId === "custom" && !customAvatarDataUrl) {
    setStatus("自分の画像を使うには、先にPNG/JPGを選択して切り抜いてください。", true);
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
        ...(avatarId === "custom" ? { customAvatarDataUrl } : {}),
        updatedAt: serverTimestamp(),
      });
    });
    savedCustomAvatarDataUrl = avatarId === "custom" ? customAvatarDataUrl : "";
    pendingCustomAvatarDataUrl = "";
    renderAvatarPreview(avatarId, currentUser);
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
