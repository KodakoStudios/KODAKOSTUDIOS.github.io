import { doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { db } from "./social-data.js";
import { DEVELOPER_UID, getDeveloperOverrides, isDeveloper } from "./developer-mode.js";

export const MAX_BLOCKED_USERS = 10;
export const getBlockedUserLimit = (uid) =>
  isDeveloper(uid) && getDeveloperOverrides(uid).bypassLimits ? 50 : MAX_BLOCKED_USERS;

const relationshipRef = (uid, collectionName, targetUid) =>
  doc(db, "profiles", uid, collectionName, targetUid);

export const followUser = async (uid, targetUid) => {
  if (!uid || !targetUid || uid === targetUid) return false;
  return runTransaction(db, async (transaction) => {
    const followingRef = relationshipRef(uid, "following", targetUid);
    const followerRef = relationshipRef(targetUid, "followers", uid);
    const ownBlockRef = relationshipRef(uid, "blocked", targetUid);
    const targetBlockRef = relationshipRef(targetUid, "blocked", uid);
    const [following, follower, ownBlock, targetBlock] = await Promise.all([
      transaction.get(followingRef),
      transaction.get(followerRef),
      transaction.get(ownBlockRef),
      transaction.get(targetBlockRef),
    ]);
    if (targetUid !== DEVELOPER_UID && (ownBlock.exists() || targetBlock.exists())) {
      const error = new Error("このユーザーはフォローできません。");
      error.code = "relationship-blocked";
      throw error;
    }
    if (!following.exists()) transaction.set(followingRef, { uid: targetUid, createdAt: serverTimestamp() });
    if (!follower.exists()) transaction.set(followerRef, { uid, targetUid, createdAt: serverTimestamp() });
    return !following.exists();
  });
};

export const unfollowUser = async (uid, targetUid) => {
  if (!uid || !targetUid) return;
  if (targetUid === DEVELOPER_UID) {
    const error = new Error("開発者アカウントのフォローは解除できません。");
    error.code = "relationship-fixed-follow";
    throw error;
  }
  await runTransaction(db, async (transaction) => {
    const followingRef = relationshipRef(uid, "following", targetUid);
    const followerRef = relationshipRef(targetUid, "followers", uid);
    const [following, follower] = await Promise.all([
      transaction.get(followingRef),
      transaction.get(followerRef),
    ]);
    if (following.exists()) transaction.delete(followingRef);
    if (follower.exists()) transaction.delete(followerRef);
  });
};

export const blockUser = async (uid, targetUid) => {
  if (!uid || !targetUid || uid === targetUid) return false;
  return runTransaction(db, async (transaction) => {
    const blockRef = relationshipRef(uid, "blocked", targetUid);
    const blockedByRef = relationshipRef(targetUid, "blockedBy", uid);
    const targetProfileRef = doc(db, "profiles", targetUid);
    const blockedUserLimit = getBlockedUserLimit(uid);
    const slotRefs = Array.from({ length: blockedUserLimit }, (_, index) =>
      relationshipRef(uid, "blockSlots", String(index).padStart(2, "0")));
    const ownFollowingRef = relationshipRef(uid, "following", targetUid);
    const targetFollowersRef = relationshipRef(targetUid, "followers", uid);
    const targetFollowingRef = relationshipRef(targetUid, "following", uid);
    const ownFollowersRef = relationshipRef(uid, "followers", targetUid);

    const [
      existingBlock,
      targetProfile,
      ...rest
    ] = await Promise.all([
      transaction.get(blockRef),
      transaction.get(targetProfileRef),
      ...slotRefs.map((ref) => transaction.get(ref)),
      transaction.get(ownFollowingRef),
      transaction.get(targetFollowersRef),
      transaction.get(targetFollowingRef),
      transaction.get(ownFollowersRef),
    ]);
    const slotSnapshots = rest.slice(0, blockedUserLimit);
    const [ownFollowing, targetFollower, targetFollowing, ownFollower] = rest.slice(blockedUserLimit);
    if (existingBlock.exists()) return false;
    if (!targetProfile.exists()) {
      const error = new Error("対象のプロフィールが見つかりません。");
      error.code = "relationship-target-not-found";
      throw error;
    }
    const availableSlot = slotSnapshots.findIndex((snapshot) => !snapshot.exists());
    if (availableSlot < 0) {
      const error = new Error(`ブロックできるのは最大${blockedUserLimit}人です。`);
      error.code = "relationship-block-limit";
      throw error;
    }
    const slotId = String(availableSlot).padStart(2, "0");
    transaction.set(blockRef, { targetUid, slotId, createdAt: serverTimestamp() });
    transaction.set(blockedByRef, { blockerUid: uid, targetUid, createdAt: serverTimestamp() });
    transaction.set(slotRefs[availableSlot], { targetUid, createdAt: serverTimestamp() });
    if (targetUid !== DEVELOPER_UID && ownFollowing.exists()) transaction.delete(ownFollowingRef);
    if (targetUid !== DEVELOPER_UID && targetFollower.exists()) transaction.delete(targetFollowersRef);
    if (targetFollowing.exists()) transaction.delete(targetFollowingRef);
    if (ownFollower.exists()) transaction.delete(ownFollowersRef);
    return true;
  });
};

export const ensureDeveloperFollow = async (uid) => {
  if (!uid || uid === DEVELOPER_UID) return false;
  return followUser(uid, DEVELOPER_UID);
};

export const unblockUser = async (uid, targetUid) => {
  if (!uid || !targetUid) return;
  await runTransaction(db, async (transaction) => {
    const blockRef = relationshipRef(uid, "blocked", targetUid);
    const blockedByRef = relationshipRef(targetUid, "blockedBy", uid);
    const blockSnapshot = await transaction.get(blockRef);
    if (!blockSnapshot.exists()) return;
    const slotId = blockSnapshot.data().slotId;
    const validSlotId = typeof slotId === "string"
      && (/^(0[0-9])$/.test(slotId) || (isDeveloper(uid) && /^[0-4][0-9]$/.test(slotId)));
    if (!validSlotId) {
      const error = new Error("ブロック情報を確認できません。");
      error.code = "relationship-invalid-block";
      throw error;
    }
    const slotRef = relationshipRef(uid, "blockSlots", slotId);
    const slotSnapshot = await transaction.get(slotRef);
    if (!slotSnapshot.exists() || slotSnapshot.data().targetUid !== targetUid) {
      const error = new Error("ブロック情報を確認できません。");
      error.code = "relationship-invalid-block";
      throw error;
    }
    transaction.delete(blockRef);
    transaction.delete(blockedByRef);
    transaction.delete(slotRef);
  });
};
