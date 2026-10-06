import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, addDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from "./firebase-auth.js";
import { db, getDisplayName, getUserProfile } from "./social-data.js";

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
let followingIds = new Set();
let activeFilter = "all";
let submitting = false;
let followUnsubscribe = null;
let postUnsubscribe = null;
let postSnapshot = null;
const likeUnsubscribers = new Map();
const replyUnsubscribers = new Map();
const followedPosts = new Set();

const setPostStatus = (message, isError = false) => {
  postStatus.textContent = message;
  postStatus.dataset.state = isError ? "error" : "info";
};

const firestoreErrorMessage = (error) => {
  if (error.code === "permission-denied") return "操作できません。Firebase Consoleへ最新のFirestoreルールを公開してください。";
  if (error.code === "unavailable" || error.code === "network-request-failed") return "Firebaseへ接続できません。ネットワークを確認して再度お試しください。";
  if (error.code === "failed-precondition") return "Firebaseのデータベース設定を確認してください。";
  return `処理に失敗しました（${error.code || "unknown"}）。時間をおいて再度お試しください。`;
};

const createReply = (reply) => {
  const item = document.createElement("div");
  item.className = "community-reply";
  const author = document.createElement("b");
  author.textContent = reply.authorName || "Googleユーザー";
  const text = document.createElement("p");
  text.textContent = reply.content;
  item.append(author, text);
  return item;
};

const openReplies = (postId, repliesContainer, replyForm) => {
  const existing = replyUnsubscribers.get(postId);
  if (existing) return;
  const repliesRef = collection(db, "communityPosts", postId, "replies");
  const unsubscribe = onSnapshot(query(repliesRef, orderBy("createdAt", "asc"), limit(50)), (snapshot) => {
    repliesContainer.replaceChildren();
    snapshot.forEach((reply) => repliesContainer.append(createReply(reply.data())));
    replyForm.querySelector("[data-reply-count]").textContent = `${snapshot.size}件のコメント`;
  }, (error) => {
    replyForm.querySelector("[data-reply-status]").textContent = firestoreErrorMessage(error);
  });
  replyUnsubscribers.set(postId, unsubscribe);
};

const createPostElement = (postId, post) => {
  const article = document.createElement("article");
  article.className = "community-post-card";
  article.dataset.postType = post.type === "art" || post.type === "video" ? post.type : "comment";

  const heading = document.createElement("div");
  heading.className = "community-post-heading";
  const authorGroup = document.createElement("span");
  authorGroup.className = "community-post-author";
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
    followButton.addEventListener("click", async () => {
      followButton.disabled = true;
      const followRef = doc(db, "profiles", currentUser.uid, "following", post.uid);
      try {
        if (followingIds.has(post.uid)) {
          await deleteDoc(followRef);
        } else {
          await setDoc(followRef, { uid: post.uid, createdAt: serverTimestamp() });
        }
      } catch (error) {
        setPostStatus(firestoreErrorMessage(error), true);
      } finally {
        followButton.disabled = !currentUser;
      }
    });
    actions.append(followButton);
  }

  const replyToggle = document.createElement("button");
  replyToggle.type = "button";
  replyToggle.className = "community-reply-toggle";
  replyToggle.textContent = "コメントする";
  const replyPanel = document.createElement("div");
  replyPanel.className = "community-reply-panel";
  replyPanel.hidden = true;
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
      await addDoc(collection(db, "communityPosts", postId, "replies"), {
        uid: currentUser.uid,
        authorName: currentDisplayName,
        content: reply,
        createdAt: serverTimestamp(),
      });
      replyInput.value = "";
      replyStatus.textContent = "コメントを送信しました。";
    } catch (error) {
      replyStatus.textContent = firestoreErrorMessage(error);
    } finally {
      replySubmit.disabled = !currentUser;
    }
  });
  replyToggle.addEventListener("click", () => {
    replyPanel.hidden = !replyPanel.hidden;
    if (!replyPanel.hidden) openReplies(postId, repliesContainer, replyForm);
  });
  actions.append(replyToggle);
  replyPanel.append(repliesContainer, replyForm);
  article.append(actions, replyPanel);

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
      userLabel.textContent = `${name} としてログイン中`;
      avatar.textContent = name.trim().charAt(0).toUpperCase() || "K";
      if (followUnsubscribe) followUnsubscribe();
      followUnsubscribe = onSnapshot(collection(db, "profiles", user.uid, "following"), (snapshot) => {
        followingIds = new Set(snapshot.docs.map((item) => item.id));
        if (postSnapshot) renderPosts();
      }, (error) => setPostStatus(firestoreErrorMessage(error), true));
      setPostStatus("投稿・コメント・いいね・フォローが利用できます。");
    } catch (error) {
      setPostStatus(firestoreErrorMessage(error), true);
    }
  } else {
    currentDisplayName = "";
    currentUsername = "";
    followingIds = new Set();
    if (followUnsubscribe) followUnsubscribe();
    followUnsubscribe = null;
    userLabel.textContent = "Googleログインが必要です";
    avatar.textContent = "K";
    setPostStatus("投稿・コメント・いいね・フォローにはGoogleログインが必要です。");
  }
  if (postSnapshot) renderPosts();
}, (error) => {
  setPostStatus(`認証状態を確認できませんでした（${error.code || "unknown"}）。`, true);
});

postUnsubscribe = onSnapshot(query(postsRef, orderBy("createdAt", "desc"), limit(50)), (snapshot) => {
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
      ...(currentUsername ? { authorUsername: currentUsername } : {}),
      content,
      isAiGenerated: aiUseInput.value === "yes",
      type: "comment",
      createdAt: serverTimestamp(),
    });
    form.reset();
    document.getElementById("fan-comment-ai-tag").hidden = true;
    setPostStatus("投稿しました。");
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
  likeUnsubscribers.forEach((unsubscribe) => unsubscribe());
  replyUnsubscribers.forEach((unsubscribe) => unsubscribe());
});
