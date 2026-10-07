export const DEVELOPER_UID = "f1Xr5FotQSVnuDx7nPMHzsNRwPy2";

const STORAGE_KEY = "kodako-developer-mode-v1";
const DEFAULT_OVERRIDES = Object.freeze({
  subscriptionActive: false,
  paidAmountYen: 0,
  bypassLimits: false,
});

export const isDeveloper = (userOrUid) =>
  (typeof userOrUid === "string" ? userOrUid : userOrUid?.uid) === DEVELOPER_UID;

export const getDeveloperOverrides = (userOrUid) => {
  if (!isDeveloper(userOrUid)) return DEFAULT_OVERRIDES;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return DEFAULT_OVERRIDES;
  const parsed = JSON.parse(saved);
  if (
    typeof parsed.subscriptionActive !== "boolean"
    || !Number.isSafeInteger(parsed.paidAmountYen)
    || parsed.paidAmountYen < 0
    || parsed.paidAmountYen > 100000000
    || typeof parsed.bypassLimits !== "boolean"
  ) {
    throw new Error("Developer Modeのローカル設定が不正です。設定を保存し直してください。");
  }
  return parsed;
};

export const saveDeveloperOverrides = (userOrUid, overrides) => {
  if (!isDeveloper(userOrUid)) {
    throw new Error("Developer Modeを利用できるアカウントではありません。");
  }
  if (
    typeof overrides.subscriptionActive !== "boolean"
    || !Number.isSafeInteger(overrides.paidAmountYen)
    || overrides.paidAmountYen < 0
    || overrides.paidAmountYen > 100000000
    || typeof overrides.bypassLimits !== "boolean"
  ) {
    throw new Error("入力内容を確認してください。");
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
};
