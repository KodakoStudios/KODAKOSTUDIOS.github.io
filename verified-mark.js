import { DEVELOPER_UID } from "./developer-mode.js";

export const createVerifiedMark = (uid) => {
  if (uid !== DEVELOPER_UID) return null;
  const mark = document.createElement("a");
  mark.className = "verified-mark";
  mark.href = "verified.html";
  mark.textContent = "✓";
  mark.title = "金のチェックマークについて";
  mark.setAttribute("aria-label", "金のチェックマークについて");
  return mark;
};
