import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { DOCUMENT } from '../constant/document';
import { FIELD } from '../constant/field';
const log = functions.logger;
const firestore = admin.firestore();
interface sendPostToUserArgsType {
  postDocId: string;
  userDocId: string;
}

export async function sendPostToUser({
  postDocId,
  userDocId: sendUserDocId,
}: sendPostToUserArgsType) {
  log.debug(`start send post / send user : ${sendUserDocId} / post : ${postDocId}`);

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
  } else {
    const selectedDoc = queryToExtraReceivableUsers(sendUserDocId);

    if (selectedDoc == null) {
      selectedUserId = getSelectedIdByQueryToReceivableUsers(useBool, sendUserDocId, sendPostRef);
    }
  }

  // 3. create doc in newPost collection -> send post
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

async function resetSendUserInReceivableCollection(resetFlag: boolean, userDocId: string) {
  const receivableUsersCollectionRef = firestore.collection(COLLECTION.RECEIVABLEUSERS);

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
    .update({ [FIELD.ISRECEIVED]: resetFlag });
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
  const receivableUsersCollectionRef = firestore.collection(COLLECTION.EXTRARECEIVABLEUSERS);

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
