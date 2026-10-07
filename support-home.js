import { collection, getFirestore, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { app, auth } from "./firebase-auth.js";
import { isDeveloper, isDeveloperSubscriptionActive } from "./developer-mode.js";

const db = getFirestore(app);
const supportersList = document.getElementById("supporters-list");
const supportersStatus = document.getElementById("supporters-status");
const announcement = document.getElementById("supporters-announcement");
const moreButton = document.getElementById("supporters-more");
const pagination = document.getElementById("supporters-pagination");
const previousButton = document.getElementById("supporters-previous");
const nextButton = document.getElementById("supporters-next");
const pageStatus = document.getElementById("supporters-page-status");
const subscriptionButton = document.querySelector(".button-subscribe");
const subscriptionStatus = document.getElementById("support-subscription-status");

let supporters = [];
let expanded = false;
let page = 0;

const formatDate = (timestamp) => {
  const date = timestamp?.toDate?.();
  if (!date) return "日時未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

const renderSupporters = () => {
  const visibleCount = expanded ? 10 : 5;
  const pageCount = Math.max(1, Math.ceil(supporters.length / 10));
  const start = expanded ? page * 10 : 0;
  const rows = supporters.slice(start, start + visibleCount).map(({ id, data }) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = `${data.donorName} : ${data.amountYen.toLocaleString("ja-JP")}円支援`;
    const test = document.createElement("small");
    test.textContent = "開発テスト・実決済なし";
    const time = document.createElement("time");
    time.dateTime = data.createdAt?.toDate?.().toISOString() || "";
    time.textContent = formatDate(data.createdAt);
    item.append(text, test, time);
    item.dataset.supportId = id;
    return item;
  });
  supportersList.replaceChildren(...rows);
  supportersStatus.textContent = supporters.length
    ? `${supporters.length}件の開発テスト記録を表示できます。`
    : "現在、公開中の支援記録はありません。";
  moreButton.hidden = supporters.length <= 5;
  moreButton.textContent = expanded ? "少なく表示する" : "もっと表示する";
  pagination.hidden = !expanded || supporters.length <= 10;
  pageStatus.textContent = `${page + 1} / ${pageCount} ページ`;
  previousButton.disabled = page === 0;
  nextButton.disabled = page >= pageCount - 1;
  if (supporters.length && announcement.childElementCount === 0) {
    const latest = supporters[0].data;
    const line = document.createElement("p");
    line.textContent = `${latest.donorName}が${latest.amountYen.toLocaleString("ja-JP")}円支援したよ！（開発テスト・実決済なし）`;
    announcement.replaceChildren(line);
  }
};

moreButton.addEventListener("click", () => {
  expanded = !expanded;
  page = 0;
  renderSupporters();
});

previousButton.addEventListener("click", () => {
  if (page > 0) {
    page -= 1;
    renderSupporters();
  }
});

nextButton.addEventListener("click", () => {
  if ((page + 1) * 10 < supporters.length) {
    page += 1;
    renderSupporters();
  }
});

onSnapshot(
  query(collection(db, "supportEvents"), orderBy("createdAt", "desc")),
  (snapshot) => {
    supporters = snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));
    if (page * 10 >= supporters.length) page = Math.max(0, Math.ceil(supporters.length / 10) - 1);
    announcement.replaceChildren();
    renderSupporters();
  },
  (error) => {
    console.error("Public support list could not be loaded:", error);
    moreButton.hidden = true;
    pagination.hidden = true;
    supportersStatus.textContent = `支援リストを読み込めませんでした（${error.code || "unknown"}）。`;
    supportersStatus.dataset.state = "error";
  },
);

onAuthStateChanged(auth, (user) => {
  if (!subscriptionButton || !subscriptionStatus) return;
  try {
    const active = isDeveloper(user) && isDeveloperSubscriptionActive(user);
    subscriptionButton.textContent = active ? "サブスク中（開発テスト）" : "月額サブスクを始める";
    subscriptionStatus.textContent = active
      ? "Developer Modeによるテスト状態です。実際の月額決済は行われていません。"
      : "定期決済サービスの設定後に利用できます。";
  } catch (error) {
    console.error("Subscription test state could not be loaded:", error);
    subscriptionStatus.textContent = "サブスク状態を読み込めませんでした。プロフィール・設定で状態を確認してください。";
    subscriptionStatus.dataset.state = "error";
  }
});
