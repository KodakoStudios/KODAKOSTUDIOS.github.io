import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from "./firebase-auth.js";
import { db } from "./social-data.js";

const preferenceControls = {
  like: document.getElementById("notify-likes"),
  reply: document.getElementById("notify-replies"),
  follow: document.getElementById("notify-follows"),
};
const preferenceStatus = document.getElementById("notification-settings-status");
const notificationList = document.getElementById("notification-list");
const preferenceDefaults = { like: true, reply: true, follow: true };
let preferences = { ...preferenceDefaults };
let currentUser = null;
let notificationsUnsubscribe = null;
let savingPreferences = false;
let latestNotificationSnapshot = null;

const notificationTypeLabel = (type) => ({
  like: "投稿にいいねしました",
  reply: "投稿に返信しました",
  follow: "あなたをフォローしました",
}[type] || "新しい通知");

const renderNotifications = (snapshot) => {
  const visible = snapshot.docs.filter((item) => preferences[item.data().type] !== false);
  notificationList.replaceChildren();
  if (!visible.length) {
    preferenceStatus.textContent = snapshot.empty ? "通知はまだありません。" : "表示する通知はありません。通知設定を確認してください。";
    preferenceStatus.dataset.state = "info";
    return;
  }
  const fragment = document.createDocumentFragment();
  visible.forEach((item) => {
    const notification = item.data();
    const entry = document.createElement("article");
    entry.className = `notification-item${notification.read ? "" : " is-unread"}`;
    const description = document.createElement("p");
    const actor = document.createElement("strong");
    actor.textContent = notification.actorName || "Googleユーザー";
    description.append(actor, document.createTextNode(`さんが${notificationTypeLabel(notification.type)}`));
    entry.append(description);
    if (notification.type === "reply" && notification.content) {
      const excerpt = document.createElement("p");
      excerpt.className = "notification-excerpt";
      excerpt.textContent = notification.content;
      entry.append(excerpt);
    }
    if (notification.postId) {
      const postLink = document.createElement("a");
      postLink.href = `fan-community.html#post-${encodeURIComponent(notification.postId)}`;
      postLink.textContent = "投稿を見る";
      entry.append(postLink);
    }
    if (!notification.read) {
      const markRead = document.createElement("button");
      markRead.type = "button";
      markRead.className = "notification-read-button";
      markRead.textContent = "既読にする";
      markRead.addEventListener("click", async () => {
        if (!currentUser) return;
        markRead.disabled = true;
        try {
          await updateDoc(doc(db, "profiles", currentUser.uid, "notifications", item.id), {
            read: true,
            readAt: serverTimestamp(),
          });
        } catch (error) {
          preferenceStatus.textContent = error.code === "permission-denied"
            ? "通知を更新できません。Firestoreルールを公開してください。"
            : `通知を更新できませんでした（${error.code || "unknown"}）。`;
          preferenceStatus.dataset.state = "error";
          markRead.disabled = false;
        }
      });
      entry.append(markRead);
    }
    fragment.append(entry);
  });
  notificationList.append(fragment);
  const unreadCount = visible.filter((item) => !item.data().read).length;
  preferenceStatus.textContent = unreadCount ? `未読${unreadCount}件の通知があります。` : `${visible.length}件の通知を表示しています。`;
  preferenceStatus.dataset.state = "info";
};

const savePreferences = async () => {
  if (!currentUser || savingPreferences) return;
  savingPreferences = true;
  Object.values(preferenceControls).forEach((control) => { control.disabled = true; });
  preferenceStatus.textContent = "通知設定を保存しています…";
  try {
    preferences = Object.fromEntries(Object.entries(preferenceControls).map(([type, control]) => [type, control.checked]));
    await setDoc(doc(db, "profiles", currentUser.uid, "preferences", "notifications"), {
      ...preferences,
      updatedAt: serverTimestamp(),
    });
    preferenceStatus.textContent = "通知設定を保存しました。";
    preferenceStatus.dataset.state = "info";
    if (latestNotificationSnapshot) renderNotifications(latestNotificationSnapshot);
  } catch (error) {
    preferenceStatus.textContent = error.code === "permission-denied"
      ? "通知設定を保存できません。Firestoreの最新ルールを公開してください。"
      : `通知設定を保存できませんでした（${error.code || "unknown"}）。`;
    preferenceStatus.dataset.state = "error";
  } finally {
    savingPreferences = false;
    Object.values(preferenceControls).forEach((control) => { control.disabled = !currentUser; });
  }
};

Object.values(preferenceControls).forEach((control) => control.addEventListener("change", savePreferences));

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (notificationsUnsubscribe) notificationsUnsubscribe();
  notificationsUnsubscribe = null;
  notificationList.replaceChildren();
  latestNotificationSnapshot = null;
  Object.values(preferenceControls).forEach((control) => { control.disabled = !user; });
  if (!user) {
    preferences = { ...preferenceDefaults };
    Object.entries(preferenceControls).forEach(([type, control]) => { control.checked = preferenceDefaults[type]; });
    preferenceStatus.textContent = "Googleログインすると通知を確認できます。";
    return;
  }

  const preferencesRef = doc(db, "profiles", user.uid, "preferences", "notifications");
  try {
    const preferenceSnapshot = await getDoc(preferencesRef);
    if (currentUser?.uid !== user.uid) return;
    preferences = { ...preferenceDefaults, ...(preferenceSnapshot.exists() ? preferenceSnapshot.data() : {}) };
    Object.entries(preferenceControls).forEach(([type, control]) => { control.checked = preferences[type] !== false; });
  } catch (error) {
    preferenceStatus.textContent = error.code === "permission-denied"
      ? "通知設定を読み込めません。Firestoreルールを公開してください。"
      : `通知設定を読み込めませんでした（${error.code || "unknown"}）。`;
    preferenceStatus.dataset.state = "error";
  }

  notificationsUnsubscribe = onSnapshot(
    query(collection(db, "profiles", user.uid, "notifications"), orderBy("createdAt", "desc"), limit(50)),
    (snapshot) => {
      latestNotificationSnapshot = snapshot;
      renderNotifications(snapshot);
    },
    (error) => {
      preferenceStatus.textContent = error.code === "permission-denied"
        ? "通知を読み込めません。Firestoreの最新ルールを公開してください。"
        : `通知を読み込めませんでした（${error.code || "unknown"}）。`;
      preferenceStatus.dataset.state = "error";
    },
  );
}, (error) => {
  preferenceStatus.textContent = `通知の認証状態を確認できませんでした（${error.code || "unknown"}）。`;
  preferenceStatus.dataset.state = "error";
});

window.addEventListener("pagehide", () => {
  if (notificationsUnsubscribe) notificationsUnsubscribe();
});
