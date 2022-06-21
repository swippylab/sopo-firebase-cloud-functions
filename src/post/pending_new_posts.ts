import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import { deleteNewPostInUser, handleRejectionPost } from './new_posts';
import sendPostToUser from './send_post';

const maxWaitHour = 2;
const executionDelayHour = 2;

const log = functions.logger;

export const onShceduledHandlePendingNewPosts = functions.pubsub
  .schedule(`0 */${executionDelayHour} * * *`)
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
    const userDocId = doc.get(FIELD.USERDOCID);
    const isReading = doc.get(FIELD.ISREADING);
    log.debug(
      `[${doc.id}] pending new post / received date : ${doc.get(
        FIELD.DATE,
      )} / user with doc : <${userDocId}> `,
    );

    let sendFlag = true;

    if (!isReading) {
      const postDocRef = admin.firestore().collection(COLLECTION.POSTS).doc(postDocId);

      await postDocRef.update({
        [FIELD.CURRENTRECEIVEDUSERDOCID]: null,
        [FIELD.ISREADING]: false,
      });
    } else {
      sendFlag = await handleRejectionPost(postDocId);
    }

    if (sendFlag) {
      await sendPostToUser({ postDocId, userDocId });
    } else {
      await deleteNewPostInUser(userDocId, postDocId);
    }
    doc.ref.delete();
  }

  log.debug('end of handle pending new posts function');
}
