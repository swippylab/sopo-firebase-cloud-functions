import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import { deleteNewPostInUserAndPendingNewPost, validateRejectionPost } from './new_posts';
import sendPostToUser from './send_post';

const maxWaitHour = 4;
const executionDelayHour = 2;

const log = functions.logger;

export const onShceduledHandlePendingNewPosts = functions.pubsub
  // .schedule(`every ${executionDelayHour} minutes`)
  .schedule(`every ${executionDelayHour} hours`)
  // .schedule(`0 */${executionDelayHour} * * *`)
  // .schedule(`* * * * *`)
  .onRun(async (/* context */) => {
    await handlePendingNewPosts();
  });

export async function handlePendingNewPosts() {
  log.debug('start handle pending new posts function');

  const firestore = admin.firestore();

  const pendNewPostsRef = firestore.collection(COLLECTION.PEDINGNEWPOSTS);

  const searchLimitDate = new Date();
  searchLimitDate.setHours(searchLimitDate.getHours() - maxWaitHour);

  log.debug(`search limit time : ${searchLimitDate.toString()}`);

  const querySnapshot = await pendNewPostsRef.where(FIELD.DATE, '<=', searchLimitDate).get();

  for (const doc of querySnapshot.docs) {
    const postDocId = doc.id;

    const postDoc = await firestore.collection(COLLECTION.POSTS).doc(postDocId).get();
    const isReading = postDoc.get(FIELD.IS_READING);
    const userDocId = postDoc.get(FIELD.CURRENT_RECEIVED_USER_DOC_ID);

    log.debug(
      `[${doc.id}] pending new post / received date : ${doc
        .get(FIELD.DATE)
        .toDate()} / user with doc : <${userDocId}> `,
    );

    log.debug(`[${doc.id}] pending new post / is reading : ${isReading}`);
    let sendFlag = true;

    // await doc.ref.delete(); // deleteNewPostInUser에서 동일 동작
    log.debug(`[${doc.id}] pending new post delete`);
    if (isReading) {
      sendFlag = await validateRejectionPost(postDocId, userDocId);
    } /*  else {
      const postDocRef = admin.firestore().collection(COLLECTION.POSTS).doc(postDocId);

      await postDocRef.update({
        [FIELD.CURRENT_RECEIVED_USER_DOC_ID]: null,
        [FIELD.IS_READING]: false,
      });

      log.debug(`[${doc.id}] doc is reading and current received user doc id reset`);
    } */

    await deleteNewPostInUserAndPendingNewPost({ userDocId, postDocId });
    if (sendFlag) {
      await sendPostToUser({ postDocId });
    }
  }

  log.debug('end of handle pending new posts function');
}
