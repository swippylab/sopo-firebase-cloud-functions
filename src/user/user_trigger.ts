import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { DOCUMENT } from '../constant/document';
import { FIELD } from '../constant/field';
import { handlePendingPosts } from '../post/pending_new_posts';
import sendPostToUser from '../post/send_post';

const firestore = admin.firestore();
const log = functions.logger;

export const onCreateUserTrigger = functions
  .runWith({})
  .firestore.document(`${COLLECTION.USERS}/{userDocId}`)
  .onCreate(async (snapshot, context) => {
    const userDocId = context.params.userDocId;

    const sendPostRef = firestore.collection(COLLECTION.GLOBALVARIABLES).doc(DOCUMENT.SENDPOST);

    const receivableUserRef = firestore.collection(COLLECTION.RECEIVABLEUSERS).doc(userDocId);

    await firestore.runTransaction(async (transaction) => {
      let sendPostDocument = await transaction.get(sendPostRef);

      // initial send post
      // if (!sendPostDocument.exists) {
      //   await initializeSendpostGlobalVariables(sendPostRef);
      // }

      sendPostDocument = await transaction.get(sendPostRef);

      const totalReceivable = sendPostDocument.get(FIELD.TOTAlRECEIVABLE);
      const searchFlag = sendPostDocument.get(FIELD.SEARCHFLAG);

      transaction.set(receivableUserRef, { [FIELD.SEARCHFLAG]: searchFlag });

      transaction.update(sendPostRef, { [FIELD.TOTAlRECEIVABLE]: totalReceivable + 1 });
    });

    handlePendingPosts();
  });

export const onUpdateUserTrigger = functions
  .runWith({})
  .firestore.document(`${COLLECTION.USERS}/{userDocId}`)
  .onUpdate(async (change, context) => {
    const userDocId = context.params.userDocId;

    const newValue = change.after.data();

    const previousValue = change.before.data();

    if (previousValue[FIELD.DELETEDDATE] !== newValue[FIELD.DELETEDDATE]) {
      log.debug(`<${userDocId}> deleteDate update`);
      onUpdateDeletedDate(userDocId);
    }
  });

// async function initializeSendpostGlobalVariables(
//   sendPostRef: admin.firestore.DocumentReference<admin.firestore.DocumentData>,
// ) {
//   await sendPostRef.set({
//     [FIELD.SEARCHFLAG]: false,
//     [FIELD.ISUSINGEXTRA]: false,
//     [FIELD.TOTAlRECEIVABLE]: 0,
//     [FIELD.RECEIVABLECOUNT]: 0,
//   });
// }

async function onUpdateDeletedDate(userDocId: string) {
  const newPostsSnapshot = await firestore
    .collection(COLLECTION.USERS)
    .doc(userDocId)
    .collection(COLLECTION.NEWPOSTS)
    .get();

  newPostsSnapshot.forEach((doc) => {
    sendPostToUser({ postDocId: doc.id, userDocId });
  });

  // totalReceivable count update and remove receivable users
  const sendPostRef = firestore.collection(COLLECTION.GLOBALVARIABLES).doc(DOCUMENT.SENDPOST);
  const receivableUserRef = firestore.collection(COLLECTION.RECEIVABLEUSERS).doc(userDocId);

  firestore.runTransaction(async (transaction) => {
    const sendPostDocument = await transaction.get(sendPostRef);

    const totalReceivable = sendPostDocument.get(FIELD.TOTAlRECEIVABLE);

    transaction.delete(receivableUserRef);

    transaction.update(sendPostRef, { [FIELD.TOTAlRECEIVABLE]: totalReceivable - 1 });
  });
}
