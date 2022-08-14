import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import Language from '../model/language';

const title = {
  // [Language.korean.toString()]: '연결된 글에 새로운 댓글이 달렸어요',
  // [Language.english.toString()]: 'You have received a new reply by linked post',
  [Language.korean.toString()]: '작성한 글에 새로운 댓글이 달렸어요',
  [Language.english.toString()]: 'You have received a new reply on a post yor wrote',
};

const _firestore = admin.firestore();

export default async function sendNewReplyArrivedMessage(
  postDocId: string,
  createReplyUserDocId: string,
  replyBody: string,
) {
  const postRef = await _firestore.collection(COLLECTION.POSTS).doc(postDocId).get();

  const postWriter: string = await postRef.get(FIELD.USER_DOC_ID);

  if (postWriter != createReplyUserDocId) {
    const userDocument = await _firestore.collection(COLLECTION.USERS).doc(postWriter).get();

    const deviceTokens: string[] = userDocument.get(FIELD.TOKENS);
    const systemLanguage: string | undefined = userDocument.get(FIELD.SYSTEM_LANGUAGE);

    if (deviceTokens?.length > 0) {
      logger.debug(`send NewReplyArrived message to <${postWriter}>: ${deviceTokens.join(',')}`);
      await admin.messaging().sendToDevice(
        deviceTokens,
        {
          data: {
            type: 'newReply',
            postId: postDocId,
            message: title[systemLanguage ?? Language.korean.toString()],
            body: replyBody,
            // receivedDate: sentDate.toISOString(),
          },
          notification: {
            title: title[systemLanguage ?? Language.korean.toString()],
            body: replyBody,
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
      logger.debug(`No log in device <${postWriter}> user / not send message`);
    }
  }

  /* const postLinksRef = await _firestore
    .collection(COLLECTION.POSTS)
    .doc(postDocId)
    .collection(COLLECTION.LINKS)
    .get();

  postLinksRef.forEach(async (doc) => {
    const linkedUserDocId = doc.id;

    if (linkedUserDocId != createReplyUserDocId) {
      const userDocument = await _firestore.collection(COLLECTION.USERS).doc(linkedUserDocId).get();

      const deviceTokens: string[] = userDocument.get(FIELD.TOKENS);
      const systemLanguage: string | undefined = userDocument.get(FIELD.SYSTEM_LANGUAGE);

      if (deviceTokens?.length > 0) {
        logger.debug(
          `send NewReplyArrived message to <${linkedUserDocId}>: ${deviceTokens.join(',')}`,
        );
        await admin.messaging().sendToDevice(
          deviceTokens,
          {
            data: {
              type: 'newReply',
              postId: postDocId,
              message: title[systemLanguage ?? Language.korean.toString()],
              // receivedDate: sentDate.toISOString(),
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
        logger.debug(`No log in device <${linkedUserDocId}> user / not send message`);
      }
    }
  }); */

  logger.debug('send messgae for reply');
}
