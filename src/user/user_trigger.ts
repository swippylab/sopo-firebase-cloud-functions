import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { DOCUMENT } from '../constant/document';
import { FIELD } from '../constant/field';
import { deleteNewPostInUserAndPendingNewPost } from '../post/new_posts';
import sendPostToUser, { setDataForSendingPostToUser } from '../post/send_post';

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

      const totalReceivable = sendPostDocument.get(FIELD.TOTAL_RECEIVABLE);
      const searchFlag = sendPostDocument.get(FIELD.SEARCH_FLAG);

      transaction.set(receivableUserRef, { [FIELD.SEARCH_FLAG]: searchFlag });

      transaction.update(sendPostRef, { [FIELD.TOTAL_RECEIVABLE]: totalReceivable + 1 });

      log.debug(`user creation trigger transaction end`);
    });

    // pending post 하나 보내기
    const pendingPostsRef = firestore.collection(COLLECTION.PENDINGPOSTS);

    const pendPostsSnapshot = await pendingPostsRef.orderBy(FIELD.DATE).limit(1).get();

    for (const doc of pendPostsSnapshot.docs) {
      const p_postDocId = doc.id;
      const receivedDate = new Date();
      const p_result = await setDataForSendingPostToUser({
        selectedUserId: userDocId,
        postDocId: p_postDocId,
        receivedDate,
      });

      log.debug(`[${p_postDocId}] pending post select 1 / send to new user <${userDocId}>`);
      if (p_result) {
        log.debug(`[${p_postDocId}] pending posts delete`);
        await doc.ref.delete();
      }
    }
  });

export const onUpdateUserTrigger = functions
  .runWith({})
  .firestore.document(`${COLLECTION.USERS}/{userDocId}`)
  .onUpdate(async (change, context) => {
    const userDocId = context.params.userDocId;

    const newValue = change.after.data();

    const previousValue = change.before.data();

    if (previousValue[FIELD.DELETED_DATE] == null && newValue[FIELD.DELETED_DATE] != null) {
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

  for (const doc of newPostsSnapshot.docs) {
    await deleteNewPostInUserAndPendingNewPost({ userDocId, postDocId: doc.id });
    await sendPostToUser({ postDocId: doc.id });
  }

  // totalReceivable count update and remove receivable users
  const sendPostRef = firestore.collection(COLLECTION.GLOBALVARIABLES).doc(DOCUMENT.SENDPOST);
  const receivableUserRef = firestore.collection(COLLECTION.RECEIVABLEUSERS).doc(userDocId);

  const extraReceivableQuerySnapshot = await firestore
    .collection(COLLECTION.EXTRARECEIVABLEUSERS)
    .where(FIELD.USER_DOC_ID, '==', userDocId)
    .get();

  await firestore.runTransaction(async (transaction) => {
    const sendPostDocument = await transaction.get(sendPostRef);

    const totalReceivable = sendPostDocument.get(FIELD.TOTAL_RECEIVABLE);

    transaction.delete(receivableUserRef);

    for (const doc of extraReceivableQuerySnapshot.docs) {
      transaction.delete(doc.ref);
    }

    const updateTotalReceivable = totalReceivable - 1;
    transaction.update(sendPostRef, { [FIELD.TOTAL_RECEIVABLE]: updateTotalReceivable });

    log.debug(`<${userDocId}> account delete / totalReceivable : ${updateTotalReceivable}`);
  });
}
