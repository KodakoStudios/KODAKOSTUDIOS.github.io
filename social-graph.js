import { doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { db } from "./social-data.js";

export const MAX_BLOCKED_USERS = 10;

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
    if (ownBlock.exists() || targetBlock.exists()) {
      const error = new Error("このユーザーはフォローできません。");
      error.code = "relationship-blocked";
      throw error;
    }
    if (following.exists()) return false;
    transaction.set(followingRef, { uid: targetUid, createdAt: serverTimestamp() });
    transaction.set(followerRef, { uid, targetUid, createdAt: serverTimestamp() });
    return true;
  });
};

export const unfollowUser = async (uid, targetUid) => {
  if (!uid || !targetUid) return;
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
    const slotRefs = Array.from({ length: MAX_BLOCKED_USERS }, (_, index) =>
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
    const slotSnapshots = rest.slice(0, MAX_BLOCKED_USERS);
    const [ownFollowing, targetFollower, targetFollowing, ownFollower] = rest.slice(MAX_BLOCKED_USERS);
    if (existingBlock.exists()) return false;
    if (!targetProfile.exists()) {
      const error = new Error("対象のプロフィールが見つかりません。");
      error.code = "relationship-target-not-found";
      throw error;
    }
    const availableSlot = slotSnapshots.findIndex((snapshot) => !snapshot.exists());
    if (availableSlot < 0) {
      const error = new Error("ブロックできるのは最大10人です。");
      error.code = "relationship-block-limit";
      throw error;
    }
    const slotId = String(availableSlot).padStart(2, "0");
    transaction.set(blockRef, { targetUid, slotId, createdAt: serverTimestamp() });
    transaction.set(blockedByRef, { blockerUid: uid, targetUid, createdAt: serverTimestamp() });
    transaction.set(slotRefs[availableSlot], { targetUid, createdAt: serverTimestamp() });
    if (ownFollowing.exists()) transaction.delete(ownFollowingRef);
    if (targetFollower.exists()) transaction.delete(targetFollowersRef);
    if (targetFollowing.exists()) transaction.delete(targetFollowingRef);
    if (ownFollower.exists()) transaction.delete(ownFollowersRef);
    return true;
  });
};

export const unblockUser = async (uid, targetUid) => {
  if (!uid || !targetUid) return;
  await runTransaction(db, async (transaction) => {
    const blockRef = relationshipRef(uid, "blocked", targetUid);
    const blockedByRef = relationshipRef(targetUid, "blockedBy", uid);
    const blockSnapshot = await transaction.get(blockRef);
    if (!blockSnapshot.exists()) return;
    const slotId = blockSnapshot.data().slotId;
    if (typeof slotId !== "string" || !/^(0[0-9])$/.test(slotId)) {
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
