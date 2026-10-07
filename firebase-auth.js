import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth,
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const status = document.querySelector("[data-auth-status]");
const loginButtons = [...document.querySelectorAll("[data-firebase-login]")];
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
auth.languageCode = "ja";
provider.setCustomParameters({ prompt: "select_account" });
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
    case "auth/popup-blocked":
      return "ログイン画面がブロックされました。このサイトのポップアップを許可してから、もう一度お試しください。";
    case "auth/popup-closed-by-user":
      return "ログイン画面が閉じられたため、ログインを完了できませんでした。もう一度お試しください。";
    case "auth/cancelled-popup-request":
      return "別のログイン画面が開かれたため、このログインをキャンセルしました。";
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
        authErrorShown = false;
        showStatus("ログアウトしました。");
      } else {
        const credential = await signInWithPopup(auth, provider);
        currentUser = credential.user;
        authErrorShown = false;
        updateButtons();
        showStatus("Googleアカウントでログイン中です。");
      }
    } catch (error) {
      showStatus(getAuthErrorMessage(error), true);
    } finally {
      button.removeAttribute("aria-busy");
      updateButtons();
    }
  });
});

setPersistence(auth, browserLocalPersistence)
  .then(() => {
    onAuthStateChanged(
      auth,
      (user) => {
        currentUser = user;
        authReady = true;
        updateButtons();
        if (!authErrorShown) {
          showStatus(user ? "Googleアカウントでログイン中です。" : "Googleアカウントでログインできます。");
        }
        if (user) {
          import("./social-graph.js")
            .then(({ ensureDeveloperFollow }) => ensureDeveloperFollow(user.uid))
            .catch((error) => {
              console.error("Required developer follow could not be saved:", error);
              showStatus(`開発者アカウントのフォローを保存できませんでした（${error.code || "unknown"}）。Firestoreルールを公開してください。`, true);
            });
        }
      },
      (error) => {
        authReady = true;
        updateButtons();
        showStatus(`認証状態を確認できませんでした（${error.code || "unknown"}）。`, true);
      },
    );
  })
  .catch((error) => {
    authReady = true;
    updateButtons();
    showStatus(getAuthErrorMessage(error), true);
  });
