import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';

const _firestore = admin.firestore();

export const sendNewPostArrived = async (userDocId: string, postDocId: string, sentDate: Date) => {
  const userDocument = await _firestore.collection(COLLECTION.USERS).doc(userDocId).get();

  const deviceTokens: string[] = userDocument.get(FIELD.DEVICETOKENS);

  if (deviceTokens) logger.debug(`sendNewPostArrived: ${deviceTokens.join(',')}`);

  await admin.messaging().sendToDevice(
    deviceTokens,
    // TODO: localize message by user local info in Firestore
    {
      data: {
        type: 'newPost',
        postId: postDocId,
        receivedDate: sentDate.toISOString(),
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
