import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';

const _firestore = admin.firestore();

export const sendNewPostArrived = async (userDocId: string, postDocId: string, sentDate: Date) => {
  const userDocument = await _firestore.collection(COLLECTION.USERS).doc(userDocId).get();

  const deviceTokens: string[] = userDocument.get(FIELD.DEVICETOKENS);

  if (deviceTokens?.length > 0) logger.debug(`sendNewPostArrived: ${deviceTokens.join(',')}`);

  // await new Promise((resolve) => setTimeout(resolve, 10));

  if (deviceTokens.length > 0) {
    await admin.messaging().sendToDevice(
      deviceTokens,
      // TODO: localize message by user local info in Firestore
      {
        data: {
          type: 'newPost',
          notificationTitle: 'New post from someone!',
          notificationBody: `${sentDate.toISOString()}`,
          postId: postDocId,
          receivedDate: sentDate.toISOString(),
        },
      },
      {
        // Required for background/quit data-only messages on iOS
        contentAvailable: true,
        // Required for background/quit data-only messages on Android
        priority: 'high',
      },
    );
  } else {
    logger.debug(`No log in device <${userDocId}> user / not send message`);
  }

  logger.debug('sendNewPostArrived');
};

// export async function sendNewReplyArrived() {

// }
