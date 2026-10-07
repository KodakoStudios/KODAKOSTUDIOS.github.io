import { collection, collectionGroup, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from "./firebase-auth.js";
import { db, getUserProfile } from "./social-data.js";
import { blockUser, followUser, getBlockedUserLimit, MAX_BLOCKED_USERS, unblockUser, unfollowUser } from "./social-graph.js";
import { DEVELOPER_UID } from "./developer-mode.js";

const status = document.getElementById("relationships-status");
const followingList = document.getElementById("following-list");
const followersList = document.getElementById("followers-list");
const blockedList = document.getElementById("blocked-list");
const followingCount = document.getElementById("following-count");
const followersCount = document.getElementById("followers-count");
const blockedCount = document.getElementById("blocked-count");
const listeners = [];
const profileCache = new Map();
let currentUser = null;
let followingIds = new Set();
let followerIds = new Set();
let blockedIds = new Set();
let blockedByIds = new Set();

const setStatus = (message, error = false) => {
  status.textContent = message;
  status.dataset.state = error ? "error" : "info";
};

const profileFor = (uid) => {
  if (!profileCache.has(uid)) {
    profileCache.set(uid, getUserProfile(uid).catch((error) => {
      console.error("Relationship profile could not be loaded:", error);
      return null;
    }));
  }
  return profileCache.get(uid);
};

const makeButton = (label, action, disabled = false) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "relationship-action";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", async () => {
    if (!currentUser) return;
    button.disabled = true;
    try {
      await action();
      renderLists();
      setStatus("関係設定を更新しました。");
    } catch (error) {
      const messages = {
        "relationship-block-limit": `ブロックできるのは最大${currentUser ? getBlockedUserLimit(currentUser.uid) : MAX_BLOCKED_USERS}人です。`,
        "relationship-blocked": "ブロック中のため、このユーザーはフォローできません。",
        "permission-denied": "操作できません。もう一度ログインしてお試しください。",
      };
      setStatus(messages[error.code] || `処理に失敗しました（${error.code || "unknown"}）。`, true);
      button.disabled = false;
    }
  });
  return button;
};

const renderRelationshipList = async (list, ids, kind) => {
  const orderedIds = [...ids].sort((left, right) => left.localeCompare(right));
  const rows = await Promise.all(orderedIds.map(async (uid) => {
    const profile = await profileFor(uid);
    const row = document.createElement("div");
    row.className = "relationship-row";
    const name = document.createElement("span");
    name.textContent = profile?.displayName || "ユーザー";
    const username = document.createElement("small");
    username.textContent = profile?.username ? `@${profile.username}` : "";
    const profileLink = document.createElement("a");
    profileLink.href = `profile.html?${profile?.username ? `username=${encodeURIComponent(profile.username)}` : `uid=${encodeURIComponent(uid)}`}`;
    profileLink.className = "relationship-profile-link";
    profileLink.setAttribute("aria-label", `${profile?.displayName || "ユーザー"}のプロフィールを見る`);
    profileLink.append(name, username);
    const identity = document.createElement("span");
    identity.className = "relationship-identity";
    identity.append(profileLink);
    row.append(identity);

    if (kind === "blocked") {
      row.append(makeButton("ブロック解除", () => unblockUser(currentUser.uid, uid)));
    } else if (kind === "following" && uid === DEVELOPER_UID) {
      row.append(makeButton("フォロー中（固定）", () => Promise.resolve(), true));
    } else if (kind === "following") {
      row.append(
        makeButton("フォロー解除", () => unfollowUser(currentUser.uid, uid)),
        makeButton("ブロック", () => blockUser(currentUser.uid, uid), blockedIds.size >= getBlockedUserLimit(currentUser.uid)),
      );
    } else if (uid === DEVELOPER_UID) {
      row.append(makeButton("フォロー中（固定）", () => Promise.resolve(), true));
    } else if (uid !== currentUser.uid) {
      row.append(
        makeButton(followingIds.has(uid) ? "フォロー中" : "フォロー", () =>
          followingIds.has(uid) ? unfollowUser(currentUser.uid, uid) : followUser(currentUser.uid, uid),
          blockedIds.has(uid) || blockedByIds.has(uid),
        ),
        makeButton("ブロック", () => blockUser(currentUser.uid, uid), blockedIds.size >= getBlockedUserLimit(currentUser.uid)),
      );
    }
    return row;
  }));
  list.replaceChildren(...rows);
  if (!rows.length) {
    const empty = document.createElement("small");
    empty.className = "relationship-empty";
    empty.textContent = kind === "following" ? "フォロー中のユーザーはいません。" : kind === "followers" ? "フォロワーはいません。" : "ブロック中のユーザーはいません。";
    list.append(empty);
  }
};

const renderLists = () => {
  followingCount.textContent = `(${followingIds.size})`;
  followersCount.textContent = `(${followerIds.size})`;
  blockedCount.textContent = `(${blockedIds.size}/${currentUser ? getBlockedUserLimit(currentUser.uid) : MAX_BLOCKED_USERS})`;
  renderRelationshipList(followingList, followingIds, "following");
  renderRelationshipList(followersList, followerIds, "followers");
  renderRelationshipList(blockedList, blockedIds, "blocked");
};

const stopListeners = () => {
  listeners.splice(0).forEach((unsubscribe) => unsubscribe());
};

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  stopListeners();
  followingIds = new Set();
  followerIds = new Set();
  blockedIds = new Set();
  blockedByIds = new Set();
  profileCache.clear();
  renderLists();
  if (!user) {
    setStatus("Googleログインすると利用できます。");
    return;
  }

  setStatus("フォロー・フォロワー・ブロックを読み込んでいます…");
  const listen = (collectionName, update) => listeners.push(onSnapshot(
    collection(db, "profiles", user.uid, collectionName),
    (snapshot) => {
      if (currentUser?.uid !== user.uid) return;
      update(new Set(snapshot.docs.map((item) => item.id)));
      renderLists();
      setStatus("フォロー・フォロワー・ブロックを表示しています。");
    },
    (error) => {
      console.error(`Could not load ${collectionName}:`, error);
      setStatus(`一覧を読み込めませんでした（${error.code || "unknown"}）。`, true);
    },
  ));
  listen("following", (ids) => { followingIds = ids; });
  listeners.push(onSnapshot(
    query(collectionGroup(db, "following"), where("uid", "==", user.uid)),
    (snapshot) => {
      if (currentUser?.uid !== user.uid) return;
      followerIds = new Set(snapshot.docs.map((item) => item.ref.parent.parent?.id).filter(Boolean));
      renderLists();
      setStatus("フォロー・フォロワー・ブロックを表示しています。");
    },
    (error) => {
      console.error("Could not load followers:", error);
      setStatus(`フォロワーを読み込めませんでした（${error.code || "unknown"}）。`, true);
    },
  ));
  listen("blocked", (ids) => { blockedIds = ids; });
  listen("blockedBy", (ids) => { blockedByIds = ids; });
}, (error) => {
  setStatus(`ログイン状態を確認できませんでした（${error.code || "unknown"}）。`, true);
});

window.addEventListener("pagehide", stopListeners);
