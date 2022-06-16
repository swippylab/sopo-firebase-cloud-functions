import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';

const log = functions.logger;
const firestore = admin.firestore();

// TODO: choose to put tokens where
// interface User {
//   name: string;
//   tokens: string[];
// }

export const sendNewPostArrived = async (userId: string, postId: string, sentDate: Date) => {
  // const userDocument = await admin.firestore().collection('users').doc(userId).get();
  // const user = userDocument.data() as User;
  const userDocument = await firestore.collection(COLLECTION.USERS).doc(userId).get();

  const deviceTokens: string[] = userDocument.get(FIELD.DEVICETOKENS);

  log.debug(deviceTokens.join(','));

  // logger.debug(`sendNewPostArrived: ${user.name}`);

  // TODO: could be passed via parameter?
  const date = new Date(); // from post
  const linked = 3; // from post

  const dummyTokens = [
    'c0f6WnDgTkmXgQAWj_Ey6J:APA91bFwtB3ghpL3x4d_ELN8NvD1NQZWGMxz0POVM6IQ9YyOrB0mgA3e9x0FRn_88WZhL4s9_Vaitr4UvhXPTObn3jyQ2HpzDg3Z_11Z3IfyMAZ8_S7Ooc3POp1CX4Y_uiJFIxhcsbLq',
  ];

  await admin.messaging().sendToDevice(
    // user.tokens,
    dummyTokens,
    // TODO: how to localize message?
    {
      data: { postId: postId, receivedDate: sentDate.toUTCString() },
      notification: {
        title: 'New post from someone!',
        body: `When: ${date}\nHow many linked: ${linked}`,
      },
    },
    {
      // Required for background/quit data-only messages on iOS
      contentAvailable: true,
      // Required for background/quit data-only messages on Android
      priority: 'high',
    },
  );
};
