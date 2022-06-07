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

export default async function sendPostToUser({
  postDocId,
  userDocId: sendUserDocId,
}: sendPostToUserArgsType) {
  log.debug(`start send post / send user : ${sendUserDocId} / post : ${postDocId}`);

  // 1. get globalVariables/systemPost
  const sendPostRef = firestore.collection(COLLECTION.GLOBALVARIABLES).doc(DOCUMENT.SENDPOST);

  let isUsingExtra = false;
  let searchFlag = false;

  await firestore.runTransaction(async (transaction) => {
    const sendPostDocument = await transaction.get(sendPostRef);

    isUsingExtra = sendPostDocument.get(FIELD.ISUSINGEXTRA);
    searchFlag = sendPostDocument.get(FIELD.SEARCHFLAG);

    log.debug(
      `get global variables / send post, searchFlag : ${searchFlag}, useExtra : ${isUsingExtra}`,
    );

    // toggle extra flag
    transaction.update(sendPostRef, { [FIELD.ISUSINGEXTRA]: !isUsingExtra });
  });

  // 2. query rejection user by this post
  let rejectionIds: string[] = await getRejectionIdsByQueryToPosts(postDocId);

  let selectedUserId = null;

  // 3. query(find doc)
  if (!isUsingExtra) {
    ({ searchFlag: searchFlag, selectedUserId } = await getSelectedIdByQueryToReceivableUsers(
      searchFlag,
      sendUserDocId,
      rejectionIds,
      sendPostRef,
    ));
  } else {
    const selectedDoc = await queryToExtraReceivableUsers(sendUserDocId, rejectionIds);

    if (selectedDoc == null) {
      ({ searchFlag: searchFlag, selectedUserId } = await getSelectedIdByQueryToReceivableUsers(
        searchFlag,
        sendUserDocId,
        rejectionIds,
        sendPostRef,
      ));
    } else {
      selectedUserId = selectedDoc.get(FIELD.USERDOCID);

      // delete selected doc
      selectedDoc.ref.delete();
    }
  }

  log.debug(`user selected to send : ${selectedUserId}`);

  // 4. create doc in newPost collection -> send post
  const newPostRef = firestore
    .collection(COLLECTION.USERS)
    .doc(selectedUserId)
    .collection(COLLECTION.NEWPOSTS)
    .doc(postDocId);
  newPostRef.set({ [FIELD.DATE]: new Date() });
}

async function getRejectionIdsByQueryToPosts(postDocId: string): Promise<string[]> {
  const postRejectionRef = firestore
    .collection(COLLECTION.POSTS)
    .doc(postDocId)
    .collection(COLLECTION.REJECTIONS);

  const rejectionSnapshot = await postRejectionRef.get();

  let rejectionIds: string[] = [];
  rejectionSnapshot.forEach((doc) => {
    rejectionIds.push(doc.id);
  });

  return rejectionIds;
}

async function getSelectedIdByQueryToReceivableUsers(
  searchFlag: boolean,
  sendUserDocId: string,
  rejectionIds: string[],
  sendPostRef: admin.firestore.DocumentReference<admin.firestore.DocumentData>,
) {
  let selectedDoc = await queryToReceivableUsers(searchFlag, sendUserDocId, rejectionIds);
  if (selectedDoc == null) {
    searchFlag = !searchFlag;

    log.debug(`receivabled users query is null / convert searchFlag : ${searchFlag}`);

    await firestore.runTransaction(async (transaction) => {
      // change use bool in global varables collection
      transaction.update(sendPostRef, { [FIELD.SEARCHFLAG]: searchFlag });
    });

    await resetSendUserInReceivableCollection(searchFlag, sendUserDocId);

    log.debug(`retry query to receivable users`);
    selectedDoc = await queryToReceivableUsers(searchFlag, sendUserDocId, rejectionIds);
  }

  if (selectedDoc == null) {
    //Todo: error
  }

  // update isReceived flag
  const receivableUserRef = firestore.collection(COLLECTION.RECEIVABLEUSERS).doc(selectedDoc?.id!);

  await receivableUserRef.update({ [FIELD.SEARCHFLAG]: !searchFlag });

  // const selectedUserId = selectedDoc?.get(FIELD.USERDOCID);
  const selectedUserId = selectedDoc?.id!;
  return { searchFlag, selectedUserId };
}

async function resetSendUserInReceivableCollection(resetFlag: boolean, userDocId: string) {
  // const receivableUsersCollectionRef = firestore.collection(COLLECTION.RECEIVABLEUSERS);

  // const sendUserReceivableDocRef = await receivableUsersCollectionRef
  //   .where(FIELD.USERDOCID, '==', userDocId)
  //   .get();

  // if (sendUserReceivableDocRef.empty) {
  //   // something wrong
  //   // Todo: error processing
  // }

  // let docId: string = '';
  // sendUserReceivableDocRef.forEach((doc) => {
  //   docId = doc.id;
  // });

  admin
    .firestore()
    .collection(COLLECTION.RECEIVABLEUSERS)
    .doc(userDocId)
    .update({ [FIELD.SEARCHFLAG]: resetFlag });
}

async function queryToReceivableUsers(
  searchFlag: boolean,
  sendUserDocId: string,
  rejectionIds: string[],
): Promise<admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData> | null> {
  log.debug(`start queryToReceivableUsers method`);
  const receivableUsersCollectionRef = firestore.collection(COLLECTION.RECEIVABLEUSERS);

  const randomKey = receivableUsersCollectionRef.doc().id;
  log.debug(
    `generated search key : ${randomKey} / searchFlag : ${searchFlag} / send User Doc id : ${sendUserDocId}`,
  );

  const gteQuerySnapshot = await receivableUsersCollectionRef
    .where(admin.firestore.FieldPath.documentId(), 'not-in', [sendUserDocId, ...rejectionIds])
    .where(FIELD.SEARCHFLAG, '==', searchFlag)
    .where(admin.firestore.FieldPath.documentId(), '>=', randomKey)
    .limit(1)
    .get();

  log.debug(`receivable user search gte size : ${gteQuerySnapshot.size}`);

  let selectedDoc = null;

  if (gteQuerySnapshot.size > 0) {
    gteQuerySnapshot.forEach((doc) => {
      selectedDoc = doc;
    });
  } else {
    const ltQuerySnapshot = await receivableUsersCollectionRef
      .where(admin.firestore.FieldPath.documentId(), 'not-in', [sendUserDocId, ...rejectionIds])
      .where(FIELD.SEARCHFLAG, '==', searchFlag)
      .where(admin.firestore.FieldPath.documentId(), '<', randomKey)
      .limit(1)
      .get();

    log.debug(`receivable user search lt size : ${ltQuerySnapshot.size}`);
    if (ltQuerySnapshot.size > 0) {
      ltQuerySnapshot.forEach((doc) => {
        selectedDoc = doc;
      });
    }
  }

  log.debug(`end queryToReceivableUsers method / selectedDoc is null : ${selectedDoc == null}`);
  return selectedDoc;
}

async function queryToExtraReceivableUsers(
  sendUserDocId: string,
  rejectionIds: string[],
): Promise<admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData> | null> {
  const extraReceivableUsersCollectionRef = firestore.collection(COLLECTION.EXTRARECEIVABLEUSERS);

  log.debug(`search extra receivable users collection / send user : ${sendUserDocId}`);
  let selectedDoc = null;
  const maxCount = 10;
  let tryCount = 1;
  while (selectedDoc == null) {
    log.debug(`[${tryCount}] search try`);

    const randomKey = extraReceivableUsersCollectionRef.doc().id;

    const gteQuerySnapshot = await extraReceivableUsersCollectionRef
      // .where(admin.firestore.FieldPath.documentId(), '!=', sendUserDocId)
      .where(admin.firestore.FieldPath.documentId(), '>=', randomKey)
      .limit(1)
      .get();

    log.debug(`extra receivable user search gte size : ${gteQuerySnapshot.size}`);

    if (gteQuerySnapshot.size > 0) {
      gteQuerySnapshot.forEach((doc) => {
        //Todo: gte, lt snapshot callback이 동일한 동작, refactoring가능
        const queryResultDocId = doc.get(FIELD.USERDOCID);
        if (queryResultDocId !== sendUserDocId) {
          if (!rejectionIds.includes(queryResultDocId)) {
            selectedDoc = doc;
          } else {
            log.debug(`query result id is included in rejection ids : ${queryResultDocId}`);
          }
        } else {
          log.debug(`query result id is same with send user id / ${doc.get(FIELD.USERDOCID)}`);
        }
      });
    } else {
      const ltQuerySnapshot = await extraReceivableUsersCollectionRef
        // .where(admin.firestore.FieldPath.documentId(), '!=', sendUserDocId)
        .where(admin.firestore.FieldPath.documentId(), '<', randomKey)
        .limit(1)
        .get();

      log.debug(`extra receivable user search lt size : ${ltQuerySnapshot.size}`);

      if (ltQuerySnapshot.size > 0) {
        gteQuerySnapshot.forEach((doc) => {
          const queryResultDocId = doc.get(FIELD.USERDOCID);
          if (queryResultDocId !== sendUserDocId) {
            if (!rejectionIds.includes(queryResultDocId)) {
              selectedDoc = doc;
            } else {
              log.debug(`query result id is included in rejection ids : ${queryResultDocId}`);
            }
          } else {
            log.debug(`query result id is same with send user id / ${queryResultDocId}`);
          }
        });
      }
    }

    if (selectedDoc == null && tryCount++ >= maxCount) {
      log.debug(
        `No documents were found that do not match the send user doc id. Escape by reaching max count`,
      );
      break;
    }
  }

  return selectedDoc;
}
