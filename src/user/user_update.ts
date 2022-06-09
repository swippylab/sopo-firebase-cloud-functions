import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import sendPostToUser from '../post/send_post';

const firestore = admin.firestore();

export const onUpdateUserTrigger = functions
  .runWith({})
  .firestore.document(`${COLLECTION.USERS}/{userDocId}`)
  .onUpdate((change, context) => {
    const userDocId = context.params.userDocId;

    const newValue = change.after.data();

    const previousValue = change.before.data();

    if (previousValue.deleteDate !== newValue.deleteDate) {
      onUpdateDeletedDate(userDocId);
    }
  });

async function onUpdateDeletedDate(userDocId: string) {
  const newPostsSnapshot = await firestore
    .collection(COLLECTION.USERS)
    .doc(userDocId)
    .collection(COLLECTION.NEWPOSTS)
    .get();

  newPostsSnapshot.forEach((doc) => {
    sendPostToUser({ postDocId: doc.id, userDocId });
  });
}
