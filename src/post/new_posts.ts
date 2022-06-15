import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import { CONSECUTIVE_REJECTED_MAX_COUNT } from '../constant/limit';
import updateLinkCountAndPreviewLinkedId from './links';
import sendPostToUser from './send_post';

const log = functions.logger;

// callable function on app
export const newPostHandleUpdateTrigger = functions
  .runWith({ failurePolicy: true })
  .firestore.document(`${COLLECTION.USERS}/{userDocId}/${COLLECTION.NEWPOSTS}/{postDocId}`)
  .onUpdate(async (changed, context) => {
    const firestore = admin.firestore();

    const userDocId: string = context.params.userDocId;
    const postDocId: string = context.params.postDocId;

    const updateData = changed.after.data();
    const receivedDate: Date = updateData[FIELD.DATE];
    const isAccepted: boolean = updateData[FIELD.ISACCEPTED];

    const batch = firestore.batch();

    log.debug(`[${postDocId}] post is accepted : ${isAccepted} by <${userDocId}>`);

    if (isAccepted) {
      const userSubCollectionData = { [FIELD.DATE]: receivedDate };

      const linkedDate = new Date();
      const postLinkData = { /* [FIELD.USERDOCID]: userDocId, */ [FIELD.LINKEDDATE]: linkedDate };

      const userReceivePostRef = firestore
        .collection(COLLECTION.USERS)
        .doc(userDocId)
        .collection(COLLECTION.RECEIVEDPOSTS)
        .doc(postDocId);

      const userAllPostRef = firestore
        .collection(COLLECTION.USERS)
        .doc(userDocId)
        .collection(COLLECTION.ALLPOSTS)
        .doc(postDocId);

      const postLinkRef = firestore
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
      const postRejectionRef = firestore
        .collection(COLLECTION.POSTS)
        .doc(postDocId)
        .collection(COLLECTION.REJECTIONS)
        .doc(userDocId);

      batch.set(postRejectionRef, {
        // [FIELD.USERDOCID]: userDocId,
        [FIELD.REJECTEDDATE]: new Date(),
      });
    }

    const batchPromise = batch.commit();

    log.debug(`[${postDocId}] new Posts trigger batch commit(async)`);

    let sendFlag = true;
    // post process
    if (isAccepted) {
      updateLinkCountAndPreviewLinkedId({ postDocId, userDocId });
    } else {
      //get lastConsecutiveRejectedTimes
      const postDocRef = await firestore.collection(COLLECTION.POSTS).doc(postDocId);

      await firestore.runTransaction(async (transaction) => {
        const postDoc = await transaction.get(postDocRef);

        let lastConsecutiveRejectedTimes = postDoc.get(FIELD.LASTCONSECUTIVEREJECTEDTIMES);

        if (!lastConsecutiveRejectedTimes) {
          lastConsecutiveRejectedTimes = 0;
        }

        lastConsecutiveRejectedTimes += 1;

        log.debug(`[${postDocId}] consecutive rejected count : ${lastConsecutiveRejectedTimes}`);

        // 연속횟수 초과시 다시 보내지 않음
        if (lastConsecutiveRejectedTimes == CONSECUTIVE_REJECTED_MAX_COUNT) {
          sendFlag = false;
          log.debug(`[${postDocId}] Do not send anywhere`);

          transaction.update(postDocRef, {
            [FIELD.LASTCONSECUTIVEREJECTEDTIMES]: lastConsecutiveRejectedTimes,
            [FIELD.ISACTIVATED]: false,
          });
        } else {
          transaction.update(postDocRef, {
            [FIELD.LASTCONSECUTIVEREJECTEDTIMES]: lastConsecutiveRejectedTimes,
          });
        }
      });
    }

    // wait for write
    await batchPromise;

    if (sendFlag) {
      log.debug(`[${[postDocId]}] post to somewhere from <${userDocId}>`);
      await sendPostToUser({ postDocId, userDocId });
    }
  });
