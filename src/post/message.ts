import * as admin from 'firebase-admin';

// TODO: choose to put tokens where
interface User {
  tokens: string[];
}

export const sendNewPostArrived = async (userId: string, postId: string, sentDate: Date) => {
  const userDocument = await admin.firestore().collection('users').doc(userId).get();
  const user = userDocument.data() as User;

  // TODO: could be passed via parameter?
  const date = new Date(); // from post
  const linked = 3; // from post

  await admin.messaging().sendToDevice(
    user.tokens,
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
