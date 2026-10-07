import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from "./firebase-auth.js";
import { db, getDisplayName, getProfileAvatarId, getUserProfile, PROFILE_AVATARS } from "./social-data.js";
import { blockUser, followUser, MAX_BLOCKED_USERS, unblockUser, unfollowUser } from "./social-graph.js";

const postsRef = collection(db, "communityPosts");
const form = document.getElementById("fan-comment-form");
const commentInput = document.getElementById("fan-comment-text");
const aiUseInput = document.getElementById("fan-comment-ai-use");
const submitButton = document.getElementById("fan-comment-submit");
const postStatus = document.getElementById("fan-comment-status");
const feedStatus = document.getElementById("community-feed-status");
const postList = document.getElementById("community-post-list");
const userLabel = document.getElementById("community-user");
const avatar = document.getElementById("community-avatar");

let currentUser = null;
let currentDisplayName = "";
let currentUsername = "";
let currentAvatarId = "google";
let currentCustomAvatarDataUrl = "";
let followingIds = new Set();
let blockedIds = new Set();
let blockedByIds = new Set();
let activeFilter = "all";
let submitting = false;
let followUnsubscribe = null;
let blockedUnsubscribe = null;
let blockedByUnsubscribe = null;
let postUnsubscribe = null;
let postSnapshot = null;
const likeUnsubscribers = new Map();
const replyUnsubscribers = new Map();
const followedPosts = new Set();
const profileAvatarCache = new Map();

const setPostStatus = (message, isError = false) => {
  postStatus.textContent = message;
  postStatus.dataset.state = isError ? "error" : "info";
};

const firestoreErrorMessage = (error) => {
  if (error.code === "relationship-blocked") return "ブロック関係があるため、このユーザーはフォローできません。";
  if (error.code === "relationship-block-limit") return `ブロックできるのは最大${MAX_BLOCKED_USERS}人です。`;
  if (error.code === "permission-denied") return "操作できません。Firebase Consoleへ最新のFirestoreルールを公開してください。";
  if (error.code === "unavailable" || error.code === "network-request-failed") return "Firebaseへ接続できません。ネットワークを確認して再度お試しください。";
  if (error.code === "failed-precondition") return "Firebaseのデータベース設定を確認してください。";
  return `処理に失敗しました（${error.code || "unknown"}）。時間をおいて再度お試しください。`;
};

const createAvatar = (avatarId, avatarUrl, fallbackName, className, customAvatarDataUrl = "") => {
  const element = document.createElement("span");
  element.className = className;
  element.setAttribute("aria-hidden", "true");
  const imageUrl = avatarId === "custom" ? customAvatarDataUrl : avatarId === "google" ? avatarUrl : "";
  if (imageUrl) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "";
    if (imageUrl.startsWith("https://")) image.referrerPolicy = "no-referrer";
    element.append(image);
  } else {
    element.textContent = PROFILE_AVATARS[avatarId] || (fallbackName || "K").trim().charAt(0).toUpperCase() || "K";
  }
  return element;
};

const loadCustomAvatar = (element, uid, avatarId) => {
  if (avatarId !== "custom" || !uid) return;
  if (!profileAvatarCache.has(uid)) {
    profileAvatarCache.set(uid, getUserProfile(uid).catch((error) => {
      console.error("Community profile avatar could not be loaded:", error);
      return null;
    }));
  }
  profileAvatarCache.get(uid).then((profile) => {
    if (!element.isConnected || !profile?.customAvatarDataUrl) return;
    const image = document.createElement("img");
    image.src = profile.customAvatarDataUrl;
    image.alt = "";
    element.replaceChildren(image);
  });
};

const renderComposerAvatar = () => {
  const rendered = createAvatar(currentAvatarId, currentUser?.photoURL, currentDisplayName, "fan-avatar", currentCustomAvatarDataUrl);
  avatar.replaceChildren(...rendered.childNodes);
};

const createNotification = async (recipientUid, notification) => {
  try {
    await addDoc(collection(db, "profiles", recipientUid, "notifications"), {
      ...notification,
      actorUid: currentUser.uid,
      actorName: currentDisplayName || (currentUser.displayName || "Googleユーザー").slice(0, 40),
      createdAt: serverTimestamp(),
      read: false,
    });
    return true;
  } catch (error) {
    console.error("Community notification could not be saved:", error);
    setPostStatus(`操作は保存されましたが、通知を送れませんでした（${error.code || "unknown"}）。Firestoreルールを公開してください。`, true);
    return false;
  }
};

const createReply = (reply) => {
  const item = document.createElement("div");
  item.className = "community-reply";
  const replyAvatar = createAvatar(reply.authorAvatarId, reply.authorAvatarUrl, reply.authorName, "community-avatar");
  loadCustomAvatar(replyAvatar, reply.uid, reply.authorAvatarId);
  item.append(replyAvatar);
  const content = document.createElement("div");
  const author = document.createElement("b");
  author.textContent = reply.authorName || "Googleユーザー";
  const text = document.createElement("p");
  text.textContent = reply.content;
  content.append(author, text);
  item.append(content);
  return item;
};

const openReplies = (postId, repliesContainer, replyForm) => {
  const existing = replyUnsubscribers.get(postId);
  if (existing) return;
  const repliesRef = collection(db, "communityPosts", postId, "replies");
  const unsubscribe = onSnapshot(query(repliesRef, orderBy("createdAt", "desc"), limit(3)), (snapshot) => {
    repliesContainer.replaceChildren();
    [...snapshot.docs].reverse().forEach((reply) => repliesContainer.append(createReply(reply.data())));
    replyForm.querySelector("[data-reply-count]").textContent = snapshot.size ? `返信（最新${snapshot.size}件）` : "まだ返信はありません";
  }, (error) => {
    replyForm.querySelector("[data-reply-status]").textContent = firestoreErrorMessage(error);
  });
  replyUnsubscribers.set(postId, unsubscribe);
};

const createPostElement = (postId, post) => {
  const article = document.createElement("article");
  article.className = "community-post-card";
  article.id = `post-${postId}`;
  article.dataset.postType = post.type === "art" || post.type === "video" ? post.type : "comment";

  const heading = document.createElement("div");
  heading.className = "community-post-heading";
  const authorGroup = document.createElement("span");
  authorGroup.className = "community-post-author";
  const postAvatar = createAvatar(post.authorAvatarId, post.authorAvatarUrl, post.authorName, "community-post-avatar");
  loadCustomAvatar(postAvatar, post.uid, post.authorAvatarId);
  authorGroup.append(postAvatar);
  const author = document.createElement("strong");
  author.textContent = post.authorName || "Googleユーザー";
  authorGroup.append(author);
  if (post.authorUsername) {
    const username = document.createElement("small");
    username.textContent = `@${post.authorUsername}`;
    authorGroup.append(username);
  }
  const date = document.createElement("time");
  if (post.createdAt?.toDate) {
    const timestamp = post.createdAt.toDate();
    date.dateTime = timestamp.toISOString();
    date.textContent = timestamp.toLocaleString("ja-JP");
  } else {
    date.textContent = "投稿したばかり";
  }
  heading.append(authorGroup, date);

  const content = document.createElement("p");
  content.className = "community-post-content";
  content.textContent = post.content;
  article.append(heading);
  if (post.isAiGenerated) {
    const tag = document.createElement("span");
    tag.className = "ai-tag-preview";
    tag.textContent = "AI生成";
    article.append(tag);
  }
  article.append(content);

  const actions = document.createElement("div");
  actions.className = "community-post-actions";
  const likeButton = document.createElement("button");
  likeButton.type = "button";
  likeButton.className = "community-like-button";
  likeButton.disabled = !currentUser || currentUser.uid === post.uid;
  likeButton.setAttribute("aria-label", "いいね");
  likeButton.textContent = "♡ 0";
  likeButton.addEventListener("click", async () => {
    if (!currentUser) return;
    likeButton.disabled = true;
    const likeRef = doc(db, "communityPosts", postId, "likes", currentUser.uid);
    try {
      if (likeButton.dataset.liked === "true") {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, { uid: currentUser.uid, createdAt: serverTimestamp() });
        if (post.uid !== currentUser.uid) {
          await createNotification(post.uid, {
            type: "like",
            postId,
            content: "",
          });
        }
      }
    } catch (error) {
      setPostStatus(firestoreErrorMessage(error), true);
    } finally {
      likeButton.disabled = !currentUser || currentUser.uid === post.uid;
    }
  });
  actions.append(likeButton);

  if (currentUser && currentUser.uid !== post.uid && post.authorUsername) {
    const followButton = document.createElement("button");
    followButton.type = "button";
    followButton.className = "community-follow-button";
    followButton.dataset.followUid = post.uid;
    followButton.textContent = followingIds.has(post.uid) ? "フォロー中" : "フォロー";
    followButton.disabled = blockedByIds.has(post.uid);
    followButton.addEventListener("click", async () => {
      followButton.disabled = true;
      try {
        if (followingIds.has(post.uid)) {
          await unfollowUser(currentUser.uid, post.uid);
        } else {
          await followUser(currentUser.uid, post.uid);
          await createNotification(post.uid, {
            type: "follow",
            content: "",
          });
        }
      } catch (error) {
        setPostStatus(firestoreErrorMessage(error), true);
      } finally {
        followButton.disabled = !currentUser || blockedByIds.has(post.uid);
      }
    });
    actions.append(followButton);
  }

  if (currentUser && currentUser.uid !== post.uid) {
    const blockButton = document.createElement("button");
    blockButton.type = "button";
    blockButton.className = "community-block-button";
    blockButton.textContent = blockedIds.has(post.uid) ? "ブロック解除" : "ブロック";
    blockButton.disabled = !blockedIds.has(post.uid) && blockedIds.size >= MAX_BLOCKED_USERS;
    blockButton.addEventListener("click", async () => {
      blockButton.disabled = true;
      try {
        if (blockedIds.has(post.uid)) {
          await unblockUser(currentUser.uid, post.uid);
        } else {
          await blockUser(currentUser.uid, post.uid);
          setPostStatus(`${post.authorName || "ユーザー"}をブロックしました。投稿とフォロー関係を非表示にします。`);
        }
      } catch (error) {
        setPostStatus(error.code === "relationship-block-limit"
          ? `ブロックできるのは最大${MAX_BLOCKED_USERS}人です。`
          : firestoreErrorMessage(error), true);
        blockButton.disabled = !currentUser || (!blockedIds.has(post.uid) && blockedIds.size >= MAX_BLOCKED_USERS);
      }
    });
    actions.append(blockButton);
  }

  const replyPanel = document.createElement("div");
  replyPanel.className = "community-reply-panel";
  const repliesContainer = document.createElement("div");
  repliesContainer.className = "community-replies";
  const replyForm = document.createElement("form");
  replyForm.className = "community-reply-form";
  const replyInput = document.createElement("textarea");
  replyInput.rows = 2;
  replyInput.maxLength = 500;
  replyInput.required = true;
  replyInput.placeholder = currentUser ? "コメントを書く（500文字以内）" : "ログインするとコメントできます";
  replyInput.disabled = !currentUser;
  const replySubmit = document.createElement("button");
  replySubmit.type = "submit";
  replySubmit.className = "button button-primary";
  replySubmit.textContent = "コメントを送信";
  replySubmit.disabled = !currentUser;
  const replyStatus = document.createElement("small");
  replyStatus.dataset.replyStatus = "";
  replyStatus.className = "feature-pending";
  const replyCount = document.createElement("small");
  replyCount.dataset.replyCount = "";
  replyCount.className = "feature-pending";
  replyForm.append(replyInput, replySubmit, replyCount, replyStatus);
  replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return;
    const reply = replyInput.value.trim();
    if (!reply || reply.length > 500) return;
    replySubmit.disabled = true;
    replyStatus.textContent = "送信しています…";
    try {
      const replyRef = doc(collection(db, "communityPosts", postId, "replies"));
      await setDoc(replyRef, {
        uid: currentUser.uid,
        authorName: currentDisplayName,
        authorAvatarId: currentAvatarId,
        ...(currentAvatarId === "google" && currentUser.photoURL ? { authorAvatarUrl: currentUser.photoURL } : {}),
        content: reply,
        createdAt: serverTimestamp(),
      });
      if (post.uid !== currentUser.uid) {
        await createNotification(post.uid, {
          type: "reply",
          postId,
          replyId: replyRef.id,
          content: reply.slice(0, 120),
        });
      }
      replyInput.value = "";
      replyStatus.textContent = "コメントを送信しました。";
    } catch (error) {
      replyStatus.textContent = firestoreErrorMessage(error);
    } finally {
      replySubmit.disabled = !currentUser;
    }
  });
  replyPanel.append(repliesContainer, replyForm);
  article.append(actions, replyPanel);
  openReplies(postId, repliesContainer, replyForm);

  const likesRef = collection(db, "communityPosts", postId, "likes");
  const unsubscribe = onSnapshot(likesRef, (snapshot) => {
    const liked = Boolean(currentUser && snapshot.docs.some((item) => item.id === currentUser.uid));
    likeButton.dataset.liked = String(liked);
    likeButton.setAttribute("aria-pressed", String(liked));
    likeButton.textContent = `${liked ? "♥" : "♡"} ${snapshot.size}`;
    likeButton.classList.toggle("is-liked", liked);
  }, (error) => {
    setPostStatus(firestoreErrorMessage(error), true);
  });
  likeUnsubscribers.set(postId, unsubscribe);
  return article;
};

const renderPosts = () => {
  likeUnsubscribers.forEach((unsubscribe) => unsubscribe());
  likeUnsubscribers.clear();
  replyUnsubscribers.forEach((unsubscribe) => unsubscribe());
  replyUnsubscribers.clear();
  postList.replaceChildren();
  const fragment = document.createDocumentFragment();
  postSnapshot.forEach((item) => {
    const post = item.data();
    if (currentUser && post.uid !== currentUser.uid && (blockedIds.has(post.uid) || blockedByIds.has(post.uid))) return;
    if (activeFilter !== "all" && (post.type || "comment") !== activeFilter) return;
    fragment.append(createPostElement(item.id, post));
  });
  postList.append(fragment);
  const visibleCount = postList.children.length;
  feedStatus.textContent = visibleCount
    ? `${visibleCount}件の投稿を表示しています。`
    : activeFilter === "all" ? "まだ投稿はありません。最初の投稿をしてみましょう。" : "この種類の投稿はまだありません。";
};

const filterButtons = document.querySelectorAll("[data-feed-filter]");
filterButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    if (button.tagName === "A") event.preventDefault();
    activeFilter = button.dataset.feedFilter;
    filterButtons.forEach((item) => {
      const selected = item.dataset.feedFilter === activeFilter;
      item.classList.toggle("active", selected);
      if (item.hasAttribute("aria-pressed")) item.setAttribute("aria-pressed", String(selected));
    });
    if (postSnapshot) renderPosts();
  });
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  commentInput.disabled = !user;
  aiUseInput.disabled = !user;
  submitButton.disabled = !user || submitting;
  submitButton.textContent = user ? "投稿する" : "Googleログイン後に投稿できます";
  if (user) {
    try {
      const [name, profile] = await Promise.all([getDisplayName(user), getUserProfile(user.uid)]);
      currentDisplayName = name;
      currentUsername = profile?.username || "";
      currentAvatarId = getProfileAvatarId(profile);
      currentCustomAvatarDataUrl = profile?.customAvatarDataUrl || "";
      if (followUnsubscribe) followUnsubscribe();
      if (blockedUnsubscribe) blockedUnsubscribe();
      if (blockedByUnsubscribe) blockedByUnsubscribe();
      userLabel.textContent = `${name} としてログイン中`;
      renderComposerAvatar();
      followUnsubscribe = onSnapshot(collection(db, "profiles", user.uid, "following"), (snapshot) => {
        followingIds = new Set(snapshot.docs.map((item) => item.id));
        if (postSnapshot) renderPosts();
      }, (error) => setPostStatus(firestoreErrorMessage(error), true));
      blockedUnsubscribe = onSnapshot(collection(db, "profiles", user.uid, "blocked"), (snapshot) => {
        blockedIds = new Set(snapshot.docs.map((item) => item.id));
        if (postSnapshot) renderPosts();
      }, (error) => setPostStatus(firestoreErrorMessage(error), true));
      blockedByUnsubscribe = onSnapshot(collection(db, "profiles", user.uid, "blockedBy"), (snapshot) => {
        blockedByIds = new Set(snapshot.docs.map((item) => item.id));
        if (postSnapshot) renderPosts();
      }, (error) => setPostStatus(firestoreErrorMessage(error), true));
      setPostStatus("投稿・コメント・いいね・フォローが利用できます。");
    } catch (error) {
      setPostStatus(firestoreErrorMessage(error), true);
    }
  } else {
    currentDisplayName = "";
    currentUsername = "";
    currentAvatarId = "google";
    currentCustomAvatarDataUrl = "";
    followingIds = new Set();
    blockedIds = new Set();
    blockedByIds = new Set();
    if (followUnsubscribe) followUnsubscribe();
    if (blockedUnsubscribe) blockedUnsubscribe();
    if (blockedByUnsubscribe) blockedByUnsubscribe();
    followUnsubscribe = null;
    blockedUnsubscribe = null;
    blockedByUnsubscribe = null;
    userLabel.textContent = "Googleログインが必要です";
    renderComposerAvatar();
    setPostStatus("投稿・コメント・いいね・フォローにはGoogleログインが必要です。");
  }
  if (postSnapshot) renderPosts();
}, (error) => {
  setPostStatus(`認証状態を確認できませんでした（${error.code || "unknown"}）。`, true);
});

postUnsubscribe = onSnapshot(query(postsRef, orderBy("createdAt", "desc"), limit(30)), (snapshot) => {
  postSnapshot = snapshot;
  renderPosts();
}, (error) => {
  feedStatus.textContent = firestoreErrorMessage(error);
  feedStatus.dataset.state = "error";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || submitting) {
    setPostStatus("投稿するにはGoogleログインが必要です。", true);
    return;
  }

  const content = commentInput.value.trim();
  if (!content || content.length > 500 || !aiUseInput.value) {
    form.reportValidity();
    return;
  }

  submitting = true;
  submitButton.disabled = true;
  setPostStatus("投稿しています…");
  try {
    await addDoc(postsRef, {
      uid: currentUser.uid,
      authorName: currentDisplayName || (currentUser.displayName || "Googleユーザー").slice(0, 40),
      authorAvatarId: currentAvatarId,
      ...(currentAvatarId === "google" && currentUser.photoURL ? { authorAvatarUrl: currentUser.photoURL } : {}),
      ...(currentUsername ? { authorUsername: currentUsername } : {}),
      content,
      isAiGenerated: aiUseInput.value === "yes",
      type: "comment",
      createdAt: serverTimestamp(),
    });
    form.reset();
    document.getElementById("fan-comment-ai-tag").hidden = true;
    setPostStatus("投稿を保存しました。プロフィールの投稿履歴にも反映されます。");
  } catch (error) {
    setPostStatus(firestoreErrorMessage(error), true);
  } finally {
    submitting = false;
    submitButton.disabled = !currentUser;
  }
});

window.addEventListener("pagehide", () => {
  if (postUnsubscribe) postUnsubscribe();
  if (followUnsubscribe) followUnsubscribe();
  if (blockedUnsubscribe) blockedUnsubscribe();
  if (blockedByUnsubscribe) blockedByUnsubscribe();
  likeUnsubscribers.forEach((unsubscribe) => unsubscribe());
  replyUnsubscribers.forEach((unsubscribe) => unsubscribe());
});
