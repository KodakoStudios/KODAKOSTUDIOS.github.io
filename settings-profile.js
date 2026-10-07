import { addDoc, collection, collectionGroup, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, updateDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from "./firebase-auth.js";
import { db, getProfileAvatarId, getUserProfile, PROFILE_AVATARS } from "./social-data.js";
import { getDeveloperAIFilter, getDeveloperOverrides, isDeveloper, isDeveloperSubscriptionActive, saveDeveloperOverrides, setDeveloperAIFilter } from "./developer-mode.js";

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
let currentDisplayName = "";
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
const developerTab = document.getElementById("developer-mode-tab");
const developerPanel = document.getElementById("developer-mode");
const developerSubscriptionState = document.getElementById("developer-subscription-state");
const developerPaidAmount = document.getElementById("developer-paid-amount");
const developerLimitBypass = document.getElementById("developer-limit-bypass");
const developerModeStatus = document.getElementById("developer-mode-status");
const developerModeSave = document.getElementById("developer-mode-save");
const developerSupportAddForm = document.getElementById("developer-support-add-form");
const developerSupportName = document.getElementById("developer-support-name");
const developerSupportAmount = document.getElementById("developer-support-amount");
const developerSupportRecords = document.getElementById("developer-support-records");
const developerPostRecords = document.getElementById("developer-post-records");
const developerDataStatus = document.getElementById("developer-data-status");
const aiFilterToggle = document.getElementById("ai-filter-toggle");
const aiFilterStatus = document.getElementById("ai-filter-status");
const subscriptionStatus = document.getElementById("subscription-settings-status");
const subscriptionDetail = document.getElementById("subscription-settings-detail");
const subscriptionNote = document.getElementById("subscription-settings-note");
const debugUidCheck = document.getElementById("debug-uid-check");
const debugPostHistory = document.getElementById("debug-post-history");
const debugReplyHistory = document.getElementById("debug-reply-history");
const debugHistoryError = document.getElementById("debug-history-error");

const updateDebugIdentity = (user) => {
  const allowed = isDeveloper(user);
  debugPanel.hidden = !allowed;
  developerTab.hidden = !allowed;
  developerPanel.hidden = !allowed;
  if (!allowed) return;
  debugUidCheck.textContent = `ログインUID: ${user.uid}（許可UIDと一致）`;
  try {
    const overrides = getDeveloperOverrides(user);
    developerSubscriptionState.value = overrides.subscriptionActive ? "active" : "inactive";
    developerPaidAmount.value = String(overrides.paidAmountYen);
    developerLimitBypass.checked = overrides.bypassLimits;
    bioInput.maxLength = overrides.bypassLimits ? 2000 : 160;
    updateDeveloperSubscriptionUi(user);
  } catch (error) {
    developerModeStatus.textContent = error.message;
    developerModeStatus.dataset.state = "error";
  }
};

const updateDeveloperSubscriptionUi = (user) => {
  const active = isDeveloperSubscriptionActive(user);
  const available = Boolean(isDeveloper(user) && active);
  aiFilterToggle.disabled = !available;
  aiFilterToggle.checked = available && getDeveloperAIFilter(user);
  aiFilterStatus.textContent = available
    ? "開発テスト用サブスクが有効です。このブラウザーではAIタグ投稿を非表示にできます（実決済なし）。"
    : "AIタグ投稿フィルターは、Developer Modeのテストサブスクが有効な場合に利用できます。";
  subscriptionStatus.textContent = available
    ? "サブスク中（Developer Modeテスト）"
    : "現在、有効なサブスクリプションはありません。";
  subscriptionDetail.textContent = available
    ? "テスト状態です。実際の契約・自動更新・決済はありません。"
    : "自動更新状況の確認・キャンセルは、決済サービス連携後に管理できます。";
  subscriptionNote.textContent = available
    ? "テストサブスクにより、このアカウントではブロック上限50人とAIタグ投稿フィルターを試せます。"
    : "支援ページの月額500円プランは、決済連携後に利用できます。";
};

const formatDonationDate = (timestamp) =>
  timestamp?.toDate?.().toLocaleString("ja-JP", { hour12: false }) || "日時未設定";

const setDeveloperDataStatus = (message, isError = false) => {
  developerDataStatus.textContent = message;
  developerDataStatus.dataset.state = isError ? "error" : "info";
};

const makeAdminButton = (label, action, className = "button button-secondary") => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
};

const renderDeveloperSupportRecord = ({ id, data }) => {
  const item = document.createElement("article");
  item.className = "developer-data-record";
  const name = document.createElement("input");
  name.type = "text";
  name.maxLength = 40;
  name.value = data.donorName;
  name.setAttribute("aria-label", "支援記録の表示名");
  const amount = document.createElement("input");
  amount.type = "number";
  amount.min = "1";
  amount.max = "100000000";
  amount.step = "1";
  amount.value = String(data.amountYen);
  amount.setAttribute("aria-label", "支援記録の金額（円）");
  const date = document.createElement("small");
  date.textContent = `${formatDonationDate(data.createdAt)}（開発テスト・実決済なし）`;
  const actions = document.createElement("div");
  actions.append(
    makeAdminButton("変更を保存", async () => {
      const donorName = name.value.trim();
      const amountYen = Number(amount.value);
      if (!donorName || donorName.length > 40 || !Number.isSafeInteger(amountYen) || amountYen < 1 || amountYen > 100000000) {
        setDeveloperDataStatus("表示名と金額（1〜100,000,000円の整数）を確認してください。", true);
        return;
      }
      try {
        await updateDoc(doc(db, "supportEvents", id), { donorName, amountYen, updatedAt: serverTimestamp() });
        setDeveloperDataStatus("支援テスト記録を更新しました。");
        await loadDeveloperRecords();
      } catch (error) {
        console.error("Developer support record could not be updated:", error);
        setDeveloperDataStatus(`支援記録を更新できませんでした（${error.code || "unknown"}）。`, true);
      }
    }),
    makeAdminButton("削除", async () => {
      if (!window.confirm("この支援テスト記録を削除しますか？")) return;
      try {
        await deleteDoc(doc(db, "supportEvents", id));
        setDeveloperDataStatus("支援テスト記録を削除しました。");
        await loadDeveloperRecords();
      } catch (error) {
        console.error("Developer support record could not be deleted:", error);
        setDeveloperDataStatus(`支援記録を削除できませんでした（${error.code || "unknown"}）。`, true);
      }
    }, "button button-light"),
  );
  item.append(name, amount, date, actions);
  return item;
};

const renderDeveloperPost = ({ id, data }) => {
  const item = document.createElement("article");
  item.className = "developer-data-record";
  const author = document.createElement("small");
  author.textContent = `${data.authorName || "ユーザー"} ・ ${formatDonationDate(data.createdAt)}`;
  const content = document.createElement("textarea");
  content.maxLength = 5000;
  content.value = data.content || "";
  content.setAttribute("aria-label", "投稿本文");
  const actions = document.createElement("div");
  actions.append(
    makeAdminButton("本文を保存", async () => {
      const text = content.value.trim();
      if (!text || text.length > 5000) {
        setDeveloperDataStatus("投稿本文は1〜5,000文字で入力してください。", true);
        return;
      }
      try {
        await updateDoc(doc(db, "communityPosts", id), { content: text });
        setDeveloperDataStatus("投稿本文を更新しました。");
      } catch (error) {
        console.error("Developer post could not be updated:", error);
        setDeveloperDataStatus(`投稿を更新できませんでした（${error.code || "unknown"}）。`, true);
      }
    }),
    makeAdminButton("投稿を削除", async () => {
      if (!window.confirm("この投稿を削除しますか？この操作は取り消せません。")) return;
      try {
        await deletePostAndChildren(id);
        await deleteDoc(doc(db, "communityPosts", id));
        setDeveloperDataStatus("投稿を削除しました。");
        await loadDeveloperRecords();
      } catch (error) {
        console.error("Developer post could not be deleted:", error);
        setDeveloperDataStatus(`投稿を削除できませんでした（${error.code || "unknown"}）。`, true);
      }
    }, "button button-light"),
  );
  item.append(author, content, actions);
  return item;
};

const deletePostAndChildren = async (postId) => {
  for (const childCollection of ["likes", "replies"]) {
    const childCollectionRef = collection(db, "communityPosts", postId, childCollection);
    while (true) {
      const snapshot = await getDocs(query(childCollectionRef, limit(400)));
      if (snapshot.empty) break;
      const batch = writeBatch(db);
      snapshot.docs.forEach((item) => batch.delete(item.ref));
      await batch.commit();
    }
  }
};

const loadDeveloperRecords = async () => {
  if (!isDeveloper(currentUser)) return;
  developerSupportRecords.textContent = "支援記録を読み込んでいます…";
  developerPostRecords.textContent = "投稿を読み込んでいます…";
  try {
    const [supportSnapshot, postSnapshot] = await Promise.all([
      getDocs(query(collection(db, "supportEvents"), orderBy("createdAt", "desc"))),
      getDocs(query(collection(db, "communityPosts"), orderBy("createdAt", "desc"))),
    ]);
    developerSupportRecords.replaceChildren(...supportSnapshot.docs.map((item) =>
      renderDeveloperSupportRecord({ id: item.id, data: item.data() })));
    developerPostRecords.replaceChildren(...postSnapshot.docs.map((item) =>
      renderDeveloperPost({ id: item.id, data: item.data() })));
    if (!supportSnapshot.size) developerSupportRecords.textContent = "支援テスト記録はありません。";
    if (!postSnapshot.size) developerPostRecords.textContent = "投稿はありません。";
  } catch (error) {
    console.error("Developer records could not be loaded:", error);
    setDeveloperDataStatus(`管理データを読み込めませんでした（${error.code || "unknown"}）。Firestoreルールを公開してください。`, true);
    developerSupportRecords.textContent = "管理データを読み込めませんでした。";
    developerPostRecords.textContent = "管理データを読み込めませんでした。";
  }
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
  currentDisplayName = user?.displayName || "開発者";
  updateDebugIdentity(user);
  updateDeveloperSubscriptionUi(user);
  loadPostHistory(user);
  setFormEnabled(Boolean(user));
  if (!user) {
    setStatus("Googleログインするとプロフィールを保存できます。");
    saveState.lastChild.textContent = " ログインが必要です";
    developerSupportRecords.replaceChildren();
    developerPostRecords.replaceChildren();
    return;
  }

  try {
    const profile = await getUserProfile(user.uid);
    currentDisplayName = profile?.username || profile?.displayName || user.displayName || "開発者";
    if (isDeveloper(user)) {
      developerSupportName.value = currentDisplayName;
      await loadDeveloperRecords();
    }
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

developerModeSave.addEventListener("click", async () => {
  if (!isDeveloper(currentUser)) return;
  const paidAmountYen = Number(developerPaidAmount.value);
  if (!Number.isSafeInteger(paidAmountYen) || paidAmountYen < 0 || paidAmountYen > 100000000) {
    developerModeStatus.textContent = "金額は0〜100,000,000円の整数で入力してください。";
    developerModeStatus.dataset.state = "error";
    return;
  }
  try {
    const overrides = {
      subscriptionActive: developerSubscriptionState.value === "active",
      paidAmountYen,
      bypassLimits: developerLimitBypass.checked,
    };
    const previousOverrides = getDeveloperOverrides(currentUser);
    const publishSupportEvent = paidAmountYen > 0 && paidAmountYen !== previousOverrides.paidAmountYen;
    developerModeSave.disabled = true;
    developerModeStatus.textContent = publishSupportEvent ? "設定と公開用テスト記録を保存しています…" : "テスト設定を保存しています…";
    const save = async () => {
      if (publishSupportEvent) {
        await addDoc(collection(db, "supportEvents"), {
          donorName: currentDisplayName.slice(0, 40),
          amountYen: paidAmountYen,
          testMode: true,
          createdByUid: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      saveDeveloperOverrides(currentUser, overrides);
      bioInput.maxLength = overrides.bypassLimits ? 2000 : 160;
      updateDeveloperSubscriptionUi(currentUser);
      developerModeStatus.textContent = `テスト設定を保存しました（サブスク: ${overrides.subscriptionActive ? "加入中" : "未加入"}、テスト表示額: ${paidAmountYen.toLocaleString("ja-JP")}円）。実際の契約・決済記録には反映されません。${publishSupportEvent ? " ホームの支援リストに「開発テスト・実決済なし」として公開しました。" : ""}`;
      developerModeStatus.dataset.state = "info";
      await loadDeveloperRecords();
    };
    try {
      await save();
    } catch (error) {
      console.error("Developer Mode settings or support test record could not be saved:", error);
      developerModeStatus.textContent = `テスト設定を保存できませんでした（${error.code || error.message || "unknown"}）。Firestoreルールを公開してください。`;
      developerModeStatus.dataset.state = "error";
    } finally {
      developerModeSave.disabled = false;
    }
  } catch (error) {
    console.error("Developer Mode settings could not be saved:", error);
    developerModeStatus.textContent = `テスト設定を保存できませんでした: ${error.message}`;
    developerModeStatus.dataset.state = "error";
  }
});

developerSupportAddForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isDeveloper(currentUser)) return;
  const donorName = developerSupportName.value.trim();
  const amountYen = Number(developerSupportAmount.value);
  if (!donorName || donorName.length > 40 || !Number.isSafeInteger(amountYen) || amountYen < 1 || amountYen > 100000000) {
    setDeveloperDataStatus("表示名と金額（1〜100,000,000円の整数）を確認してください。", true);
    return;
  }
  try {
    await addDoc(collection(db, "supportEvents"), {
      donorName,
      amountYen,
      testMode: true,
      createdByUid: currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    developerSupportAmount.value = "";
    setDeveloperDataStatus("開発テスト・実決済なしの支援記録を追加しました。");
    await loadDeveloperRecords();
  } catch (error) {
    console.error("Developer support test record could not be added:", error);
    setDeveloperDataStatus(`支援記録を追加できませんでした（${error.code || "unknown"}）。Firestoreルールを公開してください。`, true);
  }
});

aiFilterToggle.addEventListener("change", () => {
  if (!isDeveloperSubscriptionActive(currentUser)) return;
  try {
    setDeveloperAIFilter(currentUser, aiFilterToggle.checked);
    aiFilterStatus.textContent = aiFilterToggle.checked
      ? "AIタグ投稿を非表示にしました。"
      : "AIタグ投稿を表示します。";
  } catch (error) {
    console.error("Developer AI filter setting could not be saved:", error);
    aiFilterToggle.checked = false;
    aiFilterStatus.textContent = `設定を保存できませんでした: ${error.message}`;
    aiFilterStatus.dataset.state = "error";
  }
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
  const bioLimit = isDeveloper(currentUser) && getDeveloperOverrides(currentUser).bypassLimits ? 2000 : 160;
  const avatarId = selectedAvatarId();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    setStatus("ユーザー名は英小文字・数字・_ の3〜24文字で入力してください。", true);
    return;
  }
  if (!displayName || displayName.length > 40 || bio.length > bioLimit) {
    setStatus(`表示名は1〜40文字、自己紹介は${bioLimit}文字以内で入力してください。`, true);
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
