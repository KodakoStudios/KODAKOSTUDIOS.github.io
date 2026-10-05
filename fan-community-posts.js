import { addDoc, collection, getFirestore, limit, onSnapshot, orderBy, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { app, auth } from "./firebase-auth.js";

const db = getFirestore(app);
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

const setPostStatus = (message, isError = false) => {
  postStatus.textContent = message;
  postStatus.dataset.state = isError ? "error" : "info";
};

const firestoreErrorMessage = (error) => {
  if (error.code === "permission-denied") {
    return "投稿を保存できません。Firestoreのセキュリティルールが公開済みか確認してください。";
  }
  if (error.code === "unavailable" || error.code === "network-request-failed") {
    return "Firestoreに接続できません。ネットワークを確認して再度お試しください。";
  }
  if (error.code === "failed-precondition") {
    return "投稿機能のデータベース設定が不足しています。管理者にお問い合わせください。";
  }
  return `投稿処理に失敗しました（${error.code || "unknown"}）。時間をおいて再度お試しください。`;
};

const createPostElement = (post) => {
  const article = document.createElement("article");
  article.className = "community-post-card";
  article.dataset.postType = "comment";

  const heading = document.createElement("div");
  heading.className = "community-post-heading";
  const author = document.createElement("strong");
  author.textContent = post.authorName || "Googleユーザー";
  const date = document.createElement("time");
  if (post.createdAt?.toDate) {
    const timestamp = post.createdAt.toDate();
    date.dateTime = timestamp.toISOString();
    date.textContent = timestamp.toLocaleString("ja-JP");
  } else {
    date.textContent = "投稿したばかり";
  }
  heading.append(author, date);

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
  return article;
};

let currentUser = null;
let submitting = false;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  const loggedIn = Boolean(user);
  commentInput.disabled = !loggedIn;
  aiUseInput.disabled = !loggedIn;
  submitButton.disabled = !loggedIn || submitting;
  submitButton.textContent = loggedIn ? "コメントを投稿" : "Googleログイン後に投稿できます";
  userLabel.textContent = loggedIn ? `${user.displayName || "Googleユーザー"} としてログイン中` : "Googleログインが必要です";
  avatar.textContent = loggedIn ? (user.displayName || "K").trim().charAt(0).toUpperCase() : "K";
  setPostStatus(loggedIn ? "コメントを入力して投稿できます。" : "コメント投稿にはGoogleログインが必要です。");
}, (error) => {
  setPostStatus(`認証状態を確認できませんでした（${error.code || "unknown"}）。`, true);
});

onSnapshot(query(postsRef, orderBy("createdAt", "desc"), limit(50)), (snapshot) => {
  const fragment = document.createDocumentFragment();
  snapshot.forEach((postSnapshot) => {
    fragment.append(createPostElement(postSnapshot.data()));
  });
  postList.replaceChildren(fragment);
  feedStatus.textContent = snapshot.empty ? "まだ投稿はありません。最初のコメントを投稿してみましょう。" : `${snapshot.size}件の投稿を表示しています。`;
  document.querySelectorAll("[data-feed-filter]").forEach((button) => {
    if (button.classList.contains("active")) button.click();
  });
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
  setPostStatus("コメントを投稿しています…");
  try {
    await addDoc(postsRef, {
      uid: currentUser.uid,
      authorName: (currentUser.displayName || "Googleユーザー").slice(0, 80),
      content,
      isAiGenerated: aiUseInput.value === "yes",
      createdAt: serverTimestamp(),
    });
    form.reset();
    document.getElementById("fan-comment-ai-tag").hidden = true;
    setPostStatus("コメントを投稿しました。");
  } catch (error) {
    setPostStatus(firestoreErrorMessage(error), true);
  } finally {
    submitting = false;
    submitButton.disabled = !currentUser;
  }
});
