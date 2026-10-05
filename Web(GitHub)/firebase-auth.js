import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const status = document.querySelector("[data-auth-status]");
const loginButtons = [...document.querySelectorAll("[data-firebase-login]")];
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
let currentUser = null;
let authReady = false;

const showStatus = (message, isError = false) => {
  if (!status) return;
  status.textContent = message;
  status.dataset.state = isError ? "error" : "info";
};

const updateButtons = () => {
  loginButtons.forEach((button) => {
    button.disabled = !authReady;
    const label = button.querySelector("[data-auth-button-label]");
    if (label) label.textContent = currentUser ? "ログアウト" : "Googleでログイン";
  });
};

const getAuthErrorMessage = (error) => {
  switch (error.code) {
    case "auth/unauthorized-domain":
      return "このサイトのドメインがFirebase Authenticationで未承認です。Firebase ConsoleのAuthentication設定で現在のドメインを追加してください。";
    case "auth/operation-not-allowed":
      return "GoogleログインがFirebase Consoleで有効になっているか確認してください。";
    case "auth/popup-blocked":
      return "ログイン画面がブロックされました。ブラウザーのポップアップを許可して、もう一度お試しください。";
    case "auth/popup-closed-by-user":
      return "ログインをキャンセルしました。";
    default:
      return `ログイン処理に失敗しました（${error.code || "unknown"}）。時間をおいて再度お試しください。`;
  }
};

loginButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (!authReady) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    showStatus(currentUser ? "ログアウトしています…" : "Googleログインを開いています…");
    try {
      if (currentUser) {
        await signOut(auth);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (error) {
      showStatus(getAuthErrorMessage(error), true);
    } finally {
      button.removeAttribute("aria-busy");
      updateButtons();
    }
  });
});

onAuthStateChanged(
  auth,
  (user) => {
    currentUser = user;
    authReady = true;
    updateButtons();
    showStatus(user ? "Googleアカウントでログイン中です。" : "Googleアカウントでログインできます。");
  },
  (error) => {
    authReady = true;
    updateButtons();
    showStatus(`認証状態を確認できませんでした（${error.code || "unknown"}）。`, true);
  },
);
