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
    const receivedDate: Date = updateData[FIELD.DATE];
    const isAccepted: boolean = updateData[FIELD.IS_ACCEPTED];

    const batch = _firestore.batch();

    log.debug(`[${postDocId}] post is accepted : ${isAccepted} by <${userDocId}>`);

    if (isAccepted) {
      const userSubCollectionData = { [FIELD.DATE]: receivedDate };

      const linkedDate = new Date();
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
    } else {
      const postRejectionRef = _firestore
        .collection(COLLECTION.POSTS)
        .doc(postDocId)
        .collection(COLLECTION.REJECTIONS)
        .doc(userDocId);

      batch.set(postRejectionRef, {
        // [FIELD.USERDOCID]: userDocId,
        [FIELD.REJECTED_DATE]: new Date(),
      });
    }

    const batchPromise = batch.commit();
    // wait for write
    await batchPromise;

    log.debug(`[${postDocId}] new Posts trigger batch commit(sync)`);

    let sendFlag = true;
    // post process
    if (isAccepted) {
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
          [FIELD.CURRENT_RECEIVED_USER_DOC_ID]: null,
          [FIELD.IS_READING]: false,
        });

        log.debug(`[${postDocId}] update previewPost, post transaction end`);
      });

      //Todo: interator post/docId/links / send message
      // 찾는중 / linked count
    } else {
      //get lastConsecutiveRejectedTimes
      sendFlag = await handleRejectionPost(postDocId);

      //Todo: interator post/docId/links / send message
      // 찾는중 or 멈춤 /
    }

    if (sendFlag) {
      log.debug(`[${[postDocId]}] post to somewhere from <${userDocId}>`);
      await sendPostToUser({ postDocId, userDocId });
    }
  });

export async function handleRejectionPost(postDocId: string) {
  const postDocRef = await _firestore.collection(COLLECTION.POSTS).doc(postDocId);

  let sendFlag = true;
  await _firestore.runTransaction(async (transaction) => {
    const postDoc = await transaction.get(postDocRef);

    let lastConsecutiveRejectedTimes = postDoc.get(FIELD.LAST_CONSECUTIVE_REJECTED_TIMES);

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
        [FIELD.CURRENT_RECEIVED_USER_DOC_ID]: null,
        [FIELD.IS_READING]: false,
      });
    } else {
      transaction.update(postDocRef, {
        [FIELD.LAST_CONSECUTIVE_REJECTED_TIMES]: lastConsecutiveRejectedTimes,
        [FIELD.CURRENT_RECEIVED_USER_DOC_ID]: null,
        [FIELD.IS_READING]: false,
      });
    }
  });
  return sendFlag;
}

export async function deleteNewPostInUser(sendUserDocId: string, postDocId: string) {
  const deleteBatch = _firestore.batch();
  // delete userNewPost
  const newPostRef = _firestore
    .collection(COLLECTION.USERS)
    .doc(sendUserDocId)
    .collection(COLLECTION.NEWPOSTS)
    .doc(postDocId);
  deleteBatch.delete(newPostRef);
  // batch.delete(changed.after.ref); // warning으로 상위 코드로 대체하였으나 어느순간부터 warning 안뜸
  // delete pending new post
  const pendingNewPostRef = _firestore.collection(COLLECTION.PEDINGNEWPOSTS).doc(postDocId);
  deleteBatch.delete(pendingNewPostRef);

  await deleteBatch.commit();
}
