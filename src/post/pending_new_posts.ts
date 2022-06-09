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
  .onRun(async (/* context */) => {
    const firestore = admin.firestore();

    const pendNewPostsRef = firestore.collection(COLLECTION.PEDINGNEWPOSTS);

    const searchLimitDate = new Date();
    searchLimitDate.setHours(searchLimitDate.getHours() - maxWaitHour);

    const querySnapshot = await pendNewPostsRef.where(FIELD.DATE, '<=', searchLimitDate).get();

    querySnapshot.forEach(async (doc) => {
      log.debug(`[${doc.id}] post received date : ${doc.get(FIELD.DATE)}`);

      sendPostToUser({ postDocId: doc.id });
      doc.ref.delete();
    });
  });
