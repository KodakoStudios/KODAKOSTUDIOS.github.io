import { collection, doc, getDoc, increment, onSnapshot, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { auth } from "./firebase-auth.js";
import { db } from "./social-data.js";

const grid = document.getElementById("recommendation-grid");
const status = document.getElementById("recommendation-status");
const intro = document.getElementById("recommendation-intro");
const signals = new Map();
let videos = [];
let currentUser = null;
let signalsUnsubscribe = null;

const ignoredWords = new Set(["shorts", "gaming", "clip", "clips", "実況", "切り抜き", "動画", "ゲーム", "公式", "ライブ", "part"]);
const segmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("ja", { granularity: "word" })
  : null;

const keywordsFor = (title) => {
  const text = title.toLowerCase().replace(/https?:\/\/\S+/g, " ");
  const words = segmenter
    ? [...segmenter.segment(text)].filter((part) => part.isWordLike).map((part) => part.segment)
    : text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,}|[a-z0-9]{2,}/gu) || [];
  return [...new Set(words
    .map((word) => word.replace(/^#/, ""))
    .filter((word) => word.length > 1 && !ignoredWords.has(word) && !/^\d+$/.test(word)))].slice(0, 30);
};

const similarity = (first, second) => {
  if (!first.length || !second.length) return 0;
  const secondWords = new Set(second);
  const overlap = first.filter((word) => secondWords.has(word)).length;
  return overlap / new Set([...first, ...second]).size;
};

const titleFingerprint = (title) => title
  .toLowerCase()
  .replace(/#\w+/g, " ")
  .replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}a-z0-9]/giu, "")
  .replace(/shorts|gaming|clip|実況|切り抜き|動画|ゲーム|公式|ライブ|part/gu, "");

const setSignal = async (video, changes) => {
  if (!currentUser) return;
  const signalRef = doc(db, "profiles", currentUser.uid, "videoSignals", video.id);
  const existing = await getDoc(signalRef);
  const saved = existing.exists() ? existing.data() : {};
  const next = {
    videoId: video.id,
    title: video.title,
    keywords: keywordsFor(video.title),
    views: saved.views || 0,
    liked: saved.liked || false,
    ...changes,
    updatedAt: serverTimestamp(),
  };
  if (changes.viewed) {
    next.views = increment(1);
    next.lastViewedAt = serverTimestamp();
    delete next.viewed;
  }
  await setDoc(signalRef, next, { merge: true });
};

const render = () => {
  grid.replaceChildren();
  if (!videos.length) {
    status.textContent = "おすすめ動画を読み込めませんでした。時間をおいて再度お試しください。";
    status.dataset.state = "error";
    return;
  }

  const history = [...signals.values()];
  const seen = new Set(history.filter((item) => item.views > 0 || item.liked).map((item) => item.videoId));
  const candidates = videos.filter((video) => !video.isLive && !seen.has(video.id));
  const ranked = candidates.map((video) => {
    const keywords = keywordsFor(video.title);
    const matchScore = history.reduce((best, signal) => {
      const weight = (signal.liked ? 4 : 0) + Math.min(signal.views || 0, 5);
      return Math.max(best, similarity(keywords, signal.keywords || keywordsFor(signal.title)) * weight);
    }, 0);
    const recency = Date.parse(video.publishedAt || "") || 0;
    return { video, score: matchScore, recency };
  });
  ranked.sort((a, b) => history.length
    ? (b.score - a.score) || (b.recency - a.recency)
    : b.recency - a.recency);

  const selected = [];
  const fingerprints = new Set();
  for (const candidate of ranked) {
    const fingerprint = titleFingerprint(candidate.video.title);
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    selected.push(candidate);
    if (selected.length === 6) break;
  }
  const personalize = history.some((item) => item.liked || item.views > 0);
  status.textContent = selected.length
    ? personalize
      ? "サイト内で見た動画・いいねした動画に近いおすすめです。"
      : "まずは動画を見たり「いいね」したりすると、おすすめがあなた向けに変わります。"
    : "おすすめできる動画がありません。後でもう一度お試しください。";
  status.dataset.state = "info";

  const fragment = document.createDocumentFragment();
  selected.forEach(({ video }) => {
    const card = document.createElement("article");
    card.className = "recommendation-card";
    const link = document.createElement("a");
    link.className = "recommendation-video-link";
    link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `YouTubeで「${video.title}」を見る`);
    if (video.thumbnail) link.style.backgroundImage = `url("${video.thumbnail.replaceAll('"', "%22")}")`;
    const imageLabel = document.createElement("span");
    imageLabel.textContent = "▶ YouTubeで見る";
    link.append(imageLabel);
    const title = document.createElement("h3");
    title.textContent = video.title;
    const date = document.createElement("small");
    date.textContent = video.publishedAt
      ? new Date(video.publishedAt).toLocaleDateString("ja-JP")
      : "公開日不明";
    const actions = document.createElement("div");
    actions.className = "recommendation-card-actions";
    const like = document.createElement("button");
    like.type = "button";
    like.className = "community-like-button";
    like.disabled = !currentUser;
    const signal = signals.get(video.id);
    like.textContent = signal?.liked ? "♥ お気に入り" : "♡ お気に入り";
    like.setAttribute("aria-pressed", String(Boolean(signal?.liked)));
    like.addEventListener("click", async () => {
      if (!currentUser) return;
      like.disabled = true;
      try {
        await setSignal(video, { liked: !signals.get(video.id)?.liked });
      } catch (error) {
        status.textContent = error.code === "permission-denied"
          ? "動画の好みを保存できません。最新のFirestoreルールをFirebase Consoleへ公開してください。"
          : `動画の好みを保存できませんでした（${error.code || "unknown"}）。`;
        status.dataset.state = "error";
      } finally {
        like.disabled = !currentUser;
      }
    });
    actions.append(like);
    card.append(link, title, date, actions);
    fragment.append(card);
  });
  grid.append(fragment);
};

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (signalsUnsubscribe) signalsUnsubscribe();
  signalsUnsubscribe = null;
  signals.clear();
  intro.textContent = user
    ? "サイト内で動画を見たり「お気に入り」を付けたりすると、好みに近いおすすめが表示されます。"
    : "Googleログイン後、サイト内で見た動画や「お気に入り」をもとにおすすめを表示します。";
  if (user) {
    const signalsRef = collection(db, "profiles", user.uid, "videoSignals");
    signalsUnsubscribe = onSnapshot(signalsRef, (snapshot) => {
      signals.clear();
      snapshot.forEach((item) => signals.set(item.id, item.data()));
      render();
    }, (error) => {
      status.textContent = error.code === "permission-denied"
        ? "おすすめ履歴を読めません。最新のFirestoreルールをFirebase Consoleへ公開してください。"
        : `おすすめ履歴を読み込めませんでした（${error.code || "unknown"}）。`;
      status.dataset.state = "error";
    });
  } else {
    render();
  }
}, (error) => {
  status.textContent = `ログイン状態を確認できませんでした（${error.code || "unknown"}）。`;
  status.dataset.state = "error";
});

if (window.KODAKO_YOUTUBE?.getLatestVideos) {
  window.KODAKO_YOUTUBE.getLatestVideos()
    .then(({ videos: latestVideos }) => {
      videos = latestVideos;
      render();
      document.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) return;
        const link = event.target.closest('a[href*="youtube.com/watch?v="]');
        if (!link || !currentUser) return;
        const videoId = new URL(link.href).searchParams.get("v");
        const video = videos.find((item) => item.id === videoId);
        if (!video) return;
        setSignal(video, { viewed: true }).catch((error) => {
          status.textContent = error.code === "permission-denied"
            ? "視聴履歴を保存できません。最新のFirestoreルールをFirebase Consoleへ公開してください。"
            : `視聴履歴を保存できませんでした（${error.code || "unknown"}）。`;
          status.dataset.state = "error";
        });
      });
    })
    .catch((error) => {
      console.error("YouTube recommendations could not load videos:", error);
      status.textContent = "おすすめ動画を取得できません。YouTube API設定を確認してください。";
      status.dataset.state = "error";
    });
} else {
  status.textContent = "YouTube動画の読み込みが完了していません。ページを再読み込みしてください。";
  status.dataset.state = "error";
}

window.addEventListener("pagehide", () => {
  if (signalsUnsubscribe) signalsUnsubscribe();
});
