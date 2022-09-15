import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import Language from '../model/language';

const title = {
  [Language.korean.toString()]: '새로운 편지가 도착했어요',
  [Language.english.toString()]: 'You have received a new letter',
};

const _firestore = admin.firestore();

const sendNewPostArrivedMessage = async (userDocId: string, postDocId: string, sentDate: Date) => {
  const userDocument = await _firestore.collection(COLLECTION.USERS).doc(userDocId).get();

  const deviceTokens: string[] = userDocument.get(FIELD.TOKENS);
  const systemLanguage: string | undefined = userDocument.get(FIELD.SYSTEM_LANGUAGE);

  if (deviceTokens?.length > 0) logger.debug(`sendNewPostArrived: ${deviceTokens.join(',')}`);

  if (deviceTokens.length > 0) {
    await admin.messaging().sendToDevice(
      deviceTokens,
      {
        data: {
          type: 'newPost',
          postId: postDocId,
          receivedDate: sentDate.toISOString(),
        },
        notification: {
          title: title[systemLanguage ?? Language.korean.toString()],
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

export default sendNewPostArrivedMessage;
