import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const status = document.querySelector("[data-auth-status]");
const loginButtons = [...document.querySelectorAll("[data-firebase-login]")];
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
auth.languageCode = "ja";
let currentUser = null;
let authReady = false;
let authErrorShown = false;

const showStatus = (message, isError = false) => {
  if (!status) return;
  status.textContent = message;
  status.dataset.state = isError ? "error" : "info";
  if (isError) authErrorShown = true;
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
    case "auth/operation-not-allowed":
      return "GoogleログインがFirebase Consoleで有効になっているか確認してください。";
    case "auth/unauthorized-domain":
      return `このサイトのドメイン（${window.location.hostname}）がFirebase Authenticationで未承認です。承認済みドメインに追加してください。`;
    case "auth/network-request-failed":
      return "ネットワークに接続できません。接続を確認して、もう一度お試しください。";
    default:
      return `ログイン処理に失敗しました（${error.code || "unknown"}）。時間をおいて再度お試しください。`;
  }
};

loginButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (!authReady) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    authErrorShown = false;
    showStatus(currentUser ? "ログアウトしています…" : "Googleログインを開いています…");
    try {
      if (currentUser) {
        await signOut(auth);
      } else {
        await signInWithRedirect(auth, provider);
      }
    } catch (error) {
      showStatus(getAuthErrorMessage(error), true);
    } finally {
      button.removeAttribute("aria-busy");
      updateButtons();
    }
  });
});

getRedirectResult(auth).catch((error) => {
  showStatus(getAuthErrorMessage(error), true);
});

onAuthStateChanged(
  auth,
  (user) => {
    currentUser = user;
    authReady = true;
    updateButtons();
    if (!authErrorShown) {
      showStatus(user ? "Googleアカウントでログイン中です。" : "Googleアカウントでログインできます。");
    }
  },
  (error) => {
    authReady = true;
    updateButtons();
    showStatus(`認証状態を確認できませんでした（${error.code || "unknown"}）。`, true);
  },
);
