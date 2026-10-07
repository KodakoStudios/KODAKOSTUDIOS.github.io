import { collection, collectionGroup, doc, getDoc, limit, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from "./firebase-auth.js";
import { db, getUserProfile, PROFILE_AVATARS } from "./social-data.js";
import { blockUser, followUser, getBlockedUserLimit, MAX_BLOCKED_USERS, unblockUser, unfollowUser } from "./social-graph.js";
import { DEVELOPER_UID } from "./developer-mode.js";

const profileName = document.getElementById("public-profile-name");
const usernameLabel = document.getElementById("public-profile-username");
const bioLabel = document.getElementById("public-profile-bio");
const avatar = document.getElementById("public-profile-avatar");
const followButton = document.getElementById("public-follow-button");
const blockButton = document.getElementById("public-block-button");
const loginLink = document.getElementById("public-profile-login");
const status = document.getElementById("public-profile-status");
const followingCount = document.getElementById("public-following-count");
const followersCount = document.getElementById("public-followers-count");
const postsStatus = document.getElementById("public-posts-status");
const postHistory = document.getElementById("public-post-history");
const requestedProfile = new URLSearchParams(location.search);
let targetUid = "";
let targetProfile = null;
let currentUser = null;
let isFollowing = false;
let isBlocked = false;
let isBlockedByTarget = false;
let followingStateUnsubscribe = null;
let blockedStateUnsubscribe = null;
let blockedCountUnsubscribe = null;
let reciprocalBlockUnsubscribe = null;
let postsUnsubscribe = null;
let profileFollowingUnsubscribe = null;
let followersUnsubscribe = null;

const setStatus = (message, error = false) => {
  status.textContent = message;
  status.dataset.state = error ? "error" : "info";
};

const renderAvatar = () => {
  avatar.replaceChildren();
  const imageUrl = targetProfile?.avatarId === "custom"
    ? targetProfile.customAvatarDataUrl
    : targetProfile?.avatarId === "google" ? targetProfile.googlePhotoURL : "";
  if (imageUrl) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "";
    avatar.append(image);
  } else {
    avatar.textContent = PROFILE_AVATARS[targetProfile?.avatarId] || (targetProfile?.displayName || "K").trim().charAt(0).toUpperCase() || "K";
  }
};

const renderActions = () => {
  const canInteract = currentUser && targetUid && currentUser.uid !== targetUid;
  const forcedFollow = Boolean(canInteract && targetUid === DEVELOPER_UID);
  loginLink.hidden = !targetUid || Boolean(currentUser);
  followButton.hidden = !canInteract || (!forcedFollow && (isBlocked || isBlockedByTarget));
  followButton.disabled = !canInteract || isBlockedByTarget || forcedFollow;
  followButton.textContent = forcedFollow || isFollowing ? "フォロー中" : "フォロー";
  blockButton.hidden = !canInteract;
  const blockedUserLimit = currentUser ? getBlockedUserLimit(currentUser.uid) : MAX_BLOCKED_USERS;
  blockButton.disabled = !isBlocked && Number(document.body.dataset.blockedCount || 0) >= blockedUserLimit;
  blockButton.textContent = isBlocked ? "ブロック解除" : `ブロック (${document.body.dataset.blockedCount || 0}/${blockedUserLimit})`;
};

const renderPosts = (snapshot) => {
  postHistory.replaceChildren();
  const posts = snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));
  postsStatus.textContent = posts.length ? `${posts.length}件の投稿を表示しています。` : "まだ投稿はありません。";
  posts.forEach(({ id, data }) => {
    const article = document.createElement("article");
    article.className = "profile-history-item";
    const heading = document.createElement("div");
    heading.className = "profile-history-heading";
    const kind = document.createElement("strong");
    kind.textContent = data.type === "art" ? "ファンアート" : data.type === "video" ? "ファンビデオ" : "テキスト投稿";
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
    const content = document.createElement("p");
    content.textContent = data.content || "";
    article.append(content);
    const link = document.createElement("a");
    link.href = `fan-community.html#post-${encodeURIComponent(id)}`;
    link.textContent = "ファン広場で見る";
    article.append(link);
    postHistory.append(article);
  });
};

const clearListeners = () => {
  [followingStateUnsubscribe, blockedStateUnsubscribe, blockedCountUnsubscribe, reciprocalBlockUnsubscribe]
    .filter(Boolean)
    .forEach((unsubscribe) => unsubscribe());
  followingStateUnsubscribe = null;
  blockedStateUnsubscribe = null;
  blockedCountUnsubscribe = null;
  reciprocalBlockUnsubscribe = null;
};

const clearProfileListeners = () => {
  [postsUnsubscribe, profileFollowingUnsubscribe, followersUnsubscribe].filter(Boolean).forEach((unsubscribe) => unsubscribe());
  postsUnsubscribe = null;
  profileFollowingUnsubscribe = null;
  followersUnsubscribe = null;
};

const watchRelationship = () => {
  clearListeners();
  if (!currentUser || !targetUid || currentUser.uid === targetUid) {
    renderActions();
    return;
  }
  followingStateUnsubscribe = onSnapshot(doc(db, "profiles", currentUser.uid, "following", targetUid), (snapshot) => {
    isFollowing = snapshot.exists() || targetUid === DEVELOPER_UID;
    renderActions();
  }, (error) => {
    console.error("Profile follow state could not be loaded:", error);
    setStatus(`フォロー状態を読み込めませんでした（${error.code || "unknown"}）。`, true);
  });
  blockedStateUnsubscribe = onSnapshot(doc(db, "profiles", currentUser.uid, "blocked", targetUid), (snapshot) => {
    isBlocked = snapshot.exists();
    renderActions();
  }, (error) => {
    console.error("Profile block state could not be loaded:", error);
    setStatus(`ブロック状態を読み込めませんでした（${error.code || "unknown"}）。`, true);
  });
  blockedCountUnsubscribe = onSnapshot(collection(db, "profiles", currentUser.uid, "blocked"), (snapshot) => {
    document.body.dataset.blockedCount = String(snapshot.size);
    renderActions();
  }, (error) => {
    console.error("Profile block count could not be loaded:", error);
    setStatus(`ブロック数を読み込めませんでした（${error.code || "unknown"}）。`, true);
  });
  reciprocalBlockUnsubscribe = onSnapshot(doc(db, "profiles", targetUid, "blocked", currentUser.uid), (snapshot) => {
    isBlockedByTarget = snapshot.exists();
    renderActions();
  }, (error) => {
    console.error("Profile reciprocal block state could not be loaded:", error);
  });
};

const loadProfile = async () => {
  try {
    if (requestedProfile.has("username")) {
      const username = requestedProfile.get("username").toLowerCase();
      const usernameSnapshot = await getDoc(doc(db, "usernames", username));
      if (usernameSnapshot.exists()) targetUid = usernameSnapshot.data().uid;
    } else {
      targetUid = requestedProfile.get("uid") || "";
    }
    if (!targetUid) throw new Error("profile-not-found");
    targetProfile = await getUserProfile(targetUid);
    if (!targetProfile) throw new Error("profile-not-found");
    profileName.textContent = targetProfile.displayName || "ユーザー";
    usernameLabel.textContent = targetProfile.username ? `@${targetProfile.username}` : "";
    bioLabel.textContent = targetProfile.bio || "自己紹介はありません。";
    renderAvatar();
    document.title = `${targetProfile.displayName || "プロフィール"} | KODAKOSTUDIOS`;

    postsUnsubscribe = onSnapshot(
      query(collection(db, "communityPosts"), where("uid", "==", targetUid), limit(50)),
      renderPosts,
      (error) => {
        console.error("Public profile posts could not be loaded:", error);
        postsStatus.textContent = `投稿を読み込めませんでした（${error.code || "unknown"}）。`;
        postsStatus.dataset.state = "error";
      },
    );
    profileFollowingUnsubscribe = onSnapshot(collection(db, "profiles", targetUid, "following"), (snapshot) => {
      followingCount.textContent = `フォロー中: ${snapshot.size}`;
    }, (error) => {
      followingCount.textContent = `フォロー中: ${error.code || "エラー"}`;
    });
    followersUnsubscribe = onSnapshot(
      query(collectionGroup(db, "following"), where("uid", "==", targetUid)),
      (snapshot) => {
        followersCount.textContent = `フォロワー: ${snapshot.size}`;
      },
      (error) => {
        console.error("Public profile follower count could not be loaded:", error);
        followersCount.textContent = "フォロワー: 読み込み不可";
      },
    );
    setStatus("公開プロフィールを表示しています。");
    renderActions();
    watchRelationship();
  } catch (error) {
    if (error.message === "profile-not-found") {
      profileName.textContent = "プロフィールが見つかりません";
      setStatus("ユーザー名またはプロフィールURLを確認してください。", true);
      postsStatus.textContent = "プロフィールが見つからないため、投稿を表示できません。";
    } else {
      console.error("Public profile could not be loaded:", error);
      setStatus(`プロフィールを読み込めませんでした（${error.code || "unknown"}）。`, true);
    }
  }
};

followButton.addEventListener("click", async () => {
  if (!currentUser || !targetUid) return;
  followButton.disabled = true;
  try {
    if (isFollowing) {
      await unfollowUser(currentUser.uid, targetUid);
      isFollowing = false;
      setStatus("フォローを解除しました。");
    } else {
      await followUser(currentUser.uid, targetUid);
      isFollowing = true;
      setStatus("フォロー中です。");
    }
    renderActions();
  } catch (error) {
    const messages = {
      "relationship-blocked": "ブロック関係があるためフォローできません。",
      "permission-denied": "フォローを保存できません。ページを再読み込みしてお試しください。",
    };
    setStatus(messages[error.code] || `フォローを更新できませんでした（${error.code || "unknown"}）。`, true);
    renderActions();
  }
});

blockButton.addEventListener("click", async () => {
  if (!currentUser || !targetUid) return;
  blockButton.disabled = true;
  try {
    if (isBlocked) {
      await unblockUser(currentUser.uid, targetUid);
      isBlocked = false;
      setStatus("ブロックを解除しました。");
    } else {
      await blockUser(currentUser.uid, targetUid);
      isBlocked = true;
      isFollowing = targetUid === DEVELOPER_UID;
      setStatus("ブロックしました。相手の投稿は双方のファン広場で非表示になります。");
    }
    renderActions();
  } catch (error) {
    const messages = {
      "relationship-block-limit": "ブロックできるのは最大10人です。",
      "permission-denied": "ブロックを保存できません。ページを再読み込みしてお試しください。",
    };
    setStatus(messages[error.code] || `ブロックを更新できませんでした（${error.code || "unknown"}）。`, true);
    renderActions();
  }
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  isFollowing = false;
  isBlocked = false;
  isBlockedByTarget = false;
  watchRelationship();
}, (error) => {
  setStatus(`ログイン状態を確認できませんでした（${error.code || "unknown"}）。`, true);
});

loadProfile();
window.addEventListener("pagehide", () => {
  clearListeners();
  clearProfileListeners();
});
