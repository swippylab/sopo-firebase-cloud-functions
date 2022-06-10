import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import sendPostToUser from './send_post';

const maxWaitHour = 2;
const executionDelayHour = 4;

const log = functions.logger;

export const onShceduledHandlePendingNewPosts = functions.pubsub
  .schedule(`0 */${executionDelayHour} * * *`)
  // .schedule(`* * * * *`)
  .onRun(async (/* context */) => {
    log.debug('start schedule function');

    const firestore = admin.firestore();

    const pendNewPostsRef = firestore.collection(COLLECTION.PEDINGNEWPOSTS);

    const searchLimitDate = new Date();
    searchLimitDate.setHours(searchLimitDate.getHours() - maxWaitHour);

    log.debug(`search limit time : ${searchLimitDate.toString()}`);

    const querySnapshot = await pendNewPostsRef.where(FIELD.DATE, '<=', searchLimitDate).get();

    querySnapshot.forEach(async (doc) => {
      const postDocId = doc.id;
      const userDocId = doc.get(FIELD.USERDOCID);
      log.debug(
        `[${doc.id}] post received date : ${doc.get(FIELD.DATE)} / user with doc : <${userDocId}> `,
      );

      sendPostToUser({ postDocId, userDocId });
      doc.ref.delete();
    });
  });