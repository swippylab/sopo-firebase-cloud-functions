import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { DOCUMENT } from '../constant/document';
import { FIELD } from '../constant/field';
import linkCountUpdate from './links';

const log = functions.logger;

// callable function on app
export const newPostHandlerTrigger = functions
  .runWith({ failurePolicy: true })
  .firestore.document(`${COLLECTION.USERS}/{userDocId}/${COLLECTION.NEWPOSTS}/{postDocId}`)
  .onUpdate((changed, context) => {
    const firestore = admin.firestore();

    const userDocId: string = context.params.userDocId;
    const postDocId: string = context.params.postDocId;

    const updateData = changed.after.data();
    const receivedDate: Date = updateData.date;
    const isAccepted: boolean = updateData.isAccepted;

    const batch = firestore.batch();

    if (isAccepted) {
      const userSubCollectionData = { [FIELD.DATE]: receivedDate };

      const linkedDate = new Date();
      const postLinkData = { [FIELD.USERDOCID]: userDocId, [FIELD.LINKEDDATE]: linkedDate };

      const userReceivePostRef = firestore
        .collection(COLLECTION.USERS)
        .doc(userDocId)
        .collection(COLLECTION.RECEIVEDPOSTS)
        .doc(postDocId);

      const userAllPostRef = firestore
        .collection(COLLECTION.USERS)
        .doc(userDocId)
        .collection(COLLECTION.ALLPOSTS)
        .doc(postDocId);

      const postLinkRef = firestore
        .collection(COLLECTION.POSTS)
        .doc(postDocId)
        .collection(COLLECTION.LINKS)
        .doc();

      // write at userAllPosts Collection
      batch.set(userAllPostRef, userSubCollectionData);

      // write at userReceivedPosts Collection
      batch.set(userReceivePostRef, userSubCollectionData);

      // write at liniks Collection
      batch.set(postLinkRef, postLinkData);

      log.debug(`ready for isAccepted true`);
    } else {
      const postRejectionRef = firestore
        .collection(COLLECTION.POSTS)
        .doc(postDocId)
        .collection(COLLECTION.REJECTIONS)
        .doc();

      batch.set(postRejectionRef, {
        [FIELD.USERDOCID]: userDocId,
        [FIELD.REJECTEDDATE]: new Date(),
      });

      log.debug(`ready for isAccepted false`);
    }

    const newPostRef = firestore
      .collection(COLLECTION.USERS)
      .doc(userDocId)
      .collection(COLLECTION.NEWPOSTS)
      .doc(postDocId);

    // delete userNewPost / common work
    // batch.delete(changed.after.ref); // 작동은 하나 warning 발생
    batch.delete(newPostRef);

    batch.commit();

    log.debug(`new Posts trigger commit`);

    if (isAccepted) {
      log.debug(`start links collection trigger`);
      linkCountUpdate({ firestore, postDocId, userDocId });
    }

    sendPostToUser({ postDocId, userDocId });
  });

interface sendPostToUserArgsType {
  postDocId: string;
  userDocId: string;
}

export async function sendPostToUser({
  postDocId,
  userDocId: sendUserDocId,
}: sendPostToUserArgsType) {
  const firestore = admin.firestore();

  // 1. get globalVariables/systemPost
  const sendPostRef = firestore.collection(COLLECTION.GLOBALVARIABLES).doc(DOCUMENT.SENDPOST);

  let useExtra = false;
  let useBool = false;

  firestore.runTransaction(async (transaction) => {
    const sendPostDocument = await transaction.get(sendPostRef);

    useExtra = sendPostDocument.get(FIELD.USEEXTRA);
    useBool = sendPostDocument.get(FIELD.USEBOOL);

    transaction.update(sendPostRef, { [FIELD.USEEXTRA]: !useExtra });
  });

  let selectedUserId = null;

  // 2. query
  if (!useExtra) {
    ({ useBool, selectedUserId } = await getSelectedIdByQueryToReceivableUsers(
      useBool,
      sendUserDocId,
      sendPostRef,
    ));
  }

  if (useExtra) {
    const selectedDoc = queryToExtraReceivableUsers(sendUserDocId);

    if (selectedDoc == null) {
      selectedUserId = getSelectedIdByQueryToReceivableUsers(useBool, sendUserDocId, sendPostRef);
    }
  }

  // 3. create doc in newPost collection
  const newPostRef = firestore
    .collection(COLLECTION.USERS)
    .doc(selectedUserId)
    .collection(COLLECTION.NEWPOSTS)
    .doc(postDocId);
  newPostRef.set({ [FIELD.DATE]: new Date() });
}

async function getSelectedIdByQueryToReceivableUsers(
  useBool: boolean,
  sendUserDocId: string,
  sendPostRef: admin.firestore.DocumentReference<admin.firestore.DocumentData>,
) {
  let selectedDoc = await queryToReceivableUsers(useBool, sendUserDocId);

  const firestore = admin.firestore();

  if (selectedDoc == null) {
    useBool = !useBool;

    firestore.runTransaction(async (transaction) => {
      // change use bool in global varables collection
      transaction.update(sendPostRef, { [FIELD.USEBOOL]: useBool });
    });

    resetSendUserInReceivableCollection(useBool, sendUserDocId);
  }

  selectedDoc = await queryToReceivableUsers(useBool, sendUserDocId);

  if (selectedDoc == null) {
    //Todo: error
  }

  // update isReceived flag
  const receivableUserRef = firestore.collection(COLLECTION.RECEIVABLEUSERS).doc(selectedDoc?.id!);

  receivableUserRef.update({ [FIELD.ISRECEIVED]: !useBool });

  const selectedUserId = selectedDoc?.get(FIELD.USERDOCID);
  return { useBool, selectedUserId };
}

async function resetSendUserInReceivableCollection(writeIsReceived: boolean, userDocId: string) {
  const receivableUsersCollectionRef = admin.firestore().collection(COLLECTION.RECEIVABLEUSERS);

  const sendUserReceivableDocRef = await receivableUsersCollectionRef
    .where(FIELD.USERDOCID, '==', userDocId)
    .get();

  if (sendUserReceivableDocRef.empty) {
    // something wrong
    // Todo: error processing
  }

  let docId: string = '';
  sendUserReceivableDocRef.forEach((doc) => {
    docId = doc.id;
  });

  admin
    .firestore()
    .collection(COLLECTION.RECEIVABLEUSERS)
    .doc(docId)
    .update({ [FIELD.ISRECEIVED]: writeIsReceived });
}

async function queryToReceivableUsers(
  useBool: boolean,
  sendUserDocId: string,
): Promise<admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData> | null> {
  const receivableUsersCollectionRef = admin.firestore().collection(COLLECTION.RECEIVABLEUSERS);

  const randomKey = receivableUsersCollectionRef.doc().id;

  const gteQuerySnapshot = await receivableUsersCollectionRef
    .where(FIELD.USERDOCID, '!=', sendUserDocId)
    .where(FIELD.ISRECEIVED, '==', useBool)
    .where(admin.firestore.FieldPath.documentId(), '>=', randomKey)
    .limit(1)
    .get();

  let selectedDoc = null;

  if (gteQuerySnapshot.size > 0) {
    gteQuerySnapshot.forEach((doc) => {
      selectedDoc = doc;
    });
  } else {
    const ltQuerySnapshot = await receivableUsersCollectionRef
      .where(FIELD.USERDOCID, '!=', sendUserDocId)
      .where(FIELD.ISRECEIVED, '==', useBool)
      .where(admin.firestore.FieldPath.documentId(), '<', randomKey)
      .limit(1)
      .get();

    if (ltQuerySnapshot.size > 0) {
      gteQuerySnapshot.forEach((doc) => {
        selectedDoc = doc;
      });
    }
  }

  return selectedDoc;
}

async function queryToExtraReceivableUsers(
  sendUserDocId: string,
): Promise<admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData> | null> {
  const receivableUsersCollectionRef = admin
    .firestore()
    .collection(COLLECTION.EXTRARECEIVABLEUSERS);

  const randomKey = receivableUsersCollectionRef.doc().id;

  const gteQuerySnapshot = await receivableUsersCollectionRef
    .where(FIELD.USERDOCID, '!=', sendUserDocId)
    .where(admin.firestore.FieldPath.documentId(), '>=', randomKey)
    .limit(1)
    .get();

  let selectedDoc = null;

  if (gteQuerySnapshot.size > 0) {
    gteQuerySnapshot.forEach((doc) => {
      selectedDoc = doc;
    });
  } else {
    const ltQuerySnapshot = await receivableUsersCollectionRef
      .where(FIELD.USERDOCID, '!=', sendUserDocId)
      .where(admin.firestore.FieldPath.documentId(), '<', randomKey)
      .limit(1)
      .get();

    if (ltQuerySnapshot.size > 0) {
      gteQuerySnapshot.forEach((doc) => {
        selectedDoc = doc;
      });
    }
  }

  return selectedDoc;
}
