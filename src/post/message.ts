import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';

const firestore = admin.firestore();

export const sendNewPostArrived = async (userDocId: string, postDocId: string, sentDate: Date) => {
  const userDocument = await firestore.collection(COLLECTION.USERS).doc(userDocId).get();

  const deviceTokens: string[] = userDocument.get(FIELD.DEVICETOKENS);

  const postDocument = await firestore.collection(COLLECTION.POSTS).doc(postDocId).get();
  const postDocData = postDocument.data();

  if (deviceTokens) logger.debug(`sendNewPostArrived: ${deviceTokens.join(',')}`);

  await admin.messaging().sendToDevice(
    deviceTokens,
    // TODO: how to localize message?
    {
      data: {
        type: 'newPost',
        postId: postDocId,
        receivedDate: sentDate.toISOString(),
        post: JSON.stringify(postDocData),
      },
      notification: {
        title: 'New post from someone!',
        body: `${sentDate.toISOString()}`,
      },
    },
    {
      // Required for background/quit data-only messages on iOS
      contentAvailable: true,
      // Required for background/quit data-only messages on Android
      priority: 'high',
    },
  );

  logger.debug('sendNewPostArrived');
};

// export async function sendNewReplyArrived() {

// }
