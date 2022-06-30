import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import { CONSECUTIVE_REJECTED_MAX_COUNT } from '../constant/limit';
import sendPostToUser from './send_post';

const log = functions.logger;
const _firestore = admin.firestore();

// callable function on app
export const newPostHandleUpdateTrigger = functions
  .runWith({ failurePolicy: true })
  .firestore.document(`${COLLECTION.USERS}/{userDocId}/${COLLECTION.NEWPOSTS}/{postDocId}`)
  .onUpdate(async (changed, context) => {
    const userDocId: string = context.params.userDocId;
    const postDocId: string = context.params.postDocId;

    const updateData = changed.after.data();
    // const receivedDate: Date = updateData[FIELD.DATE];
    const isAccepted: boolean = updateData[FIELD.IS_ACCEPTED];

    // delete new post in user and pending new post, 다른 트리거랑 중복 가능성 배제를 위해 먼저 제거
    await deleteNewPostInUserAndPendingNewPost({ userDocId, postDocId });

    log.debug(`[${postDocId}] post is accepted : ${isAccepted} by <${userDocId}>`);

    let sendFlag = true;

    if (isAccepted) {
      const linkedDate = new Date();
      const batch = _firestore.batch();

      // const userSubCollectionData = { [FIELD.DATE]: receivedDate };
      const userSubCollectionData = { [FIELD.DATE]: linkedDate };

      const postLinkData = { /* [FIELD.USERDOCID]: userDocId, */ [FIELD.LINKED_DATE]: linkedDate };

      const userReceivePostRef = _firestore
        .collection(COLLECTION.USERS)
        .doc(userDocId)
        .collection(COLLECTION.RECEIVEDPOSTS)
        .doc(postDocId);

      const userAllPostRef = _firestore
        .collection(COLLECTION.USERS)
        .doc(userDocId)
        .collection(COLLECTION.ALLPOSTS)
        .doc(postDocId);

      const postLinkRef = _firestore
        .collection(COLLECTION.POSTS)
        .doc(postDocId)
        .collection(COLLECTION.LINKS)
        .doc(userDocId);

      // write at userAllPosts Collection
      batch.set(userAllPostRef, userSubCollectionData);

      // write at userReceivedPosts Collection
      batch.set(userReceivePostRef, userSubCollectionData);

      // write at liniks Collection
      batch.set(postLinkRef, postLinkData);

      const batchPromise = batch.commit();
      // wait for write
      await batchPromise;

      log.debug(`[${postDocId}] new Posts trigger batch commit(sync)`);

      // updateLinkCountAndPreviewLinkedId({ postDocId /* , userDocId */ });
      log.debug(`[${postDocId}] update linked count`);

      // links collection create trigger
      // get post document with post id
      const postDocRef = _firestore.collection(COLLECTION.POSTS).doc(postDocId);

      await _firestore.runTransaction(async (transaction) => {
        const postDoc = await transaction.get(postDocRef);
        if (!postDoc.exists) {
          throw `${COLLECTION.POSTS}/${postDocId}} does not exist`;
        }
        const linkedCount = postDoc.get(FIELD.LINKED_COUNT);

        const updateLinkedCount = linkedCount + 1;

        // update post Document / field linkedCount
        transaction.update(postDocRef, {
          [FIELD.LINKED_COUNT]: updateLinkedCount,
          [FIELD.LAST_CONSECUTIVE_REJECTED_TIMES]: 0,
          // [FIELD.CURRENT_RECEIVED_USER_DOC_ID]: null,
          // [FIELD.IS_READING]: false,
        });

        log.debug(`[${postDocId}] update linkedCount transaction end`);
      });

      //Todo: interator post/docId/links / send message
      // 찾는중 / linked count
    } else {
      // batch.set(postRejectionRef, {
      //   // [FIELD.USERDOCID]: userDocId,
      //   [FIELD.REJECTED_DATE]: new Date(),
      // });

      // const batchPromise = batch.commit();
      // wait for write
      // await batchPromise;

      //get lastConsecutiveRejectedTimes
      sendFlag = await validateRejectionPost(postDocId, userDocId);

      //Todo: interator post/docId/links / send message
      // 찾는중 or 멈춤 /
    }

    if (sendFlag) {
      log.debug(`[${[postDocId]}] post to somewhere from <${userDocId}>`);
      await sendPostToUser({ postDocId });
    }
  });

export async function validateRejectionPost(postDocId: string, userDocId: string) {
  log.debug(`[${postDocId}] doc / handle rejection function start / reject user : <${userDocId}>`);
  const postDocRef = await _firestore.collection(COLLECTION.POSTS).doc(postDocId);

  const postRejectionRef = _firestore
    .collection(COLLECTION.POSTS)
    .doc(postDocId)
    .collection(COLLECTION.REJECTIONS)
    .doc(userDocId);

  // await postRejectionRef.set({
  //   [FIELD.REJECTED_DATE]: new Date(),
  // });

  let sendFlag = true;
  await _firestore.runTransaction(async (transaction) => {
    const postDoc = await transaction.get(postDocRef);

    let lastConsecutiveRejectedTimes = postDoc.get(FIELD.LAST_CONSECUTIVE_REJECTED_TIMES);

    // common
    transaction.set(postRejectionRef, {
      [FIELD.REJECTED_DATE]: new Date(),
    });

    if (!lastConsecutiveRejectedTimes) {
      lastConsecutiveRejectedTimes = 0;
    }

    lastConsecutiveRejectedTimes += 1;

    log.debug(`[${postDocId}] consecutive rejected count : ${lastConsecutiveRejectedTimes}`);

    // 연속횟수 초과시 다시 보내지 않음
    if (lastConsecutiveRejectedTimes >= CONSECUTIVE_REJECTED_MAX_COUNT) {
      sendFlag = false;
      log.debug(`[${postDocId}] Do not send anywhere`);

      transaction.update(postDocRef, {
        [FIELD.LAST_CONSECUTIVE_REJECTED_TIMES]: lastConsecutiveRejectedTimes,
        [FIELD.IS_ACTIVATED]: false,
        // [FIELD.CURRENT_RECEIVED_USER_DOC_ID]: null,
        // [FIELD.IS_READING]: false,
      });
    } else {
      transaction.update(postDocRef, {
        [FIELD.LAST_CONSECUTIVE_REJECTED_TIMES]: lastConsecutiveRejectedTimes,
        // [FIELD.CURRENT_RECEIVED_USER_DOC_ID]: null,
        // [FIELD.IS_READING]: false,
      });
    }
  });
  return sendFlag;
}

export async function deleteNewPostInUserAndPendingNewPost({
  userDocId,
  postDocId,
}: {
  userDocId: string;
  postDocId: string;
}) {
  log.debug(`[${postDocId}] doc delete in new posts user [${userDocId}] / pending new posts`);

  const batch = _firestore.batch();

  // post의 현재유저와 읽음상태 초기화
  log.debug(`[${postDocId}] doc is reading and current received user doc id reset`);
  const postRef = _firestore.collection(COLLECTION.POSTS).doc(postDocId);
  batch.update(postRef, {
    [FIELD.CURRENT_RECEIVED_USER_DOC_ID]: null,
    [FIELD.IS_READING]: false,
  });

  // delete userNewPost
  const newPostRef = _firestore
    .collection(COLLECTION.USERS)
    .doc(userDocId)
    .collection(COLLECTION.NEWPOSTS)
    .doc(postDocId);
  // batch.delete(changed.after.ref); // warning으로 상위 코드로 대체하였으나 어느순간부터 warning 안뜸
  batch.delete(newPostRef);

  // delete pending new post
  const pendingNewPostRef = _firestore.collection(COLLECTION.PEDINGNEWPOSTS).doc(postDocId);
  batch.delete(pendingNewPostRef);

  await batch.commit();
}
