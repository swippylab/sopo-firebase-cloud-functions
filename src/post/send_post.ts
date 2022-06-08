import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { DOCUMENT } from '../constant/document';
import { FIELD } from '../constant/field';
const log = functions.logger;
const firestore = admin.firestore();
interface sendPostToUserArgsType {
  postDocId: string;
}

export default async function sendPostToUser({
  postDocId,
}: // userDocId: sendUserDocId,
sendPostToUserArgsType) {
  log.debug(`start send post : ${postDocId}`);

  // 1. get globalVariables/systemPost
  const sendPostRef = firestore.collection(COLLECTION.GLOBALVARIABLES).doc(DOCUMENT.SENDPOST);

  let isUsingExtra = false;
  let searchFlag = false;

  let isProcessPendingPost = false;

  // 2. reserve extra flag, check receivable count
  await firestore.runTransaction(async (transaction) => {
    const sendPostDocument = await transaction.get(sendPostRef);

    const sendPostData = sendPostDocument.data()!;

    isUsingExtra = sendPostData[FIELD.ISUSINGEXTRA];
    searchFlag = sendPostData[FIELD.SEARCHFLAG];

    const totalReceivableCount = sendPostData[FIELD.TOTAlRECEIVABLE];
    const receivableCount = sendPostData[FIELD.RECEIVABLECOUNT];

    log.debug(
      `get global variables / send post, searchFlag : ${searchFlag}, isUsingExtra : ${isUsingExtra}, receivableCount: ${receivableCount}, totalReceivableCount: ${totalReceivableCount}`,
    );
    if (totalReceivableCount >= receivableCount) {
      // reset count, reverse flag
      searchFlag = !searchFlag;

      log.debug(`reverse searchFlag : ${searchFlag} / reset receivableCount`);

      transaction.update(sendPostRef, {
        [FIELD.ISUSINGEXTRA]: !isUsingExtra,
        [FIELD.SEARCHFLAG]: searchFlag,
        [FIELD.RECEIVABLECOUNT]: 0,
      });

      isProcessPendingPost = true;
    } else {
      transaction.update(sendPostRef, { [FIELD.ISUSINGEXTRA]: !isUsingExtra });
    }
  });

  // 3. process pending posts
  if (isProcessPendingPost) {
    log.debug(`start pend posts process`);
    const pendingPostsRef = firestore.collection(COLLECTION.PENDINGPOSTS);

    const pendPostsSnapshot = await pendingPostsRef.orderBy(FIELD.CREATEDDATE).get();

    let temp_isUsingExtra = isUsingExtra;

    pendPostsSnapshot.forEach(async (doc) => {
      const p_postDocId = doc.id;
      const p_result = await sendPostByQuery(p_postDocId, temp_isUsingExtra, searchFlag);

      if (p_result) {
        log.debug(`pending posts[${p_postDocId}] delete`);
        doc.ref.delete();
        temp_isUsingExtra = !temp_isUsingExtra;
      }
    });
    log.debug(`end pend posts process`);
  }

  // 4. send post to selected user by query
  const result = await sendPostByQuery(postDocId, isUsingExtra, searchFlag);

  // 5. send to pending posts colleciton
  if (!result) {
    log.debug(`not found send user id / insert pending collection`);
    const pendingPostRef = firestore.collection(COLLECTION.PENDINGPOSTS).doc(postDocId);
    pendingPostRef.set({ [FIELD.CREATEDDATE]: new Date() });
  }
}

function setNewPostsCollectionInSelectedUser(
  selectedUserId: any,
  postDocId: string,
): Promise<admin.firestore.WriteResult> {
  const newPostRef = firestore
    .collection(COLLECTION.USERS)
    .doc(selectedUserId)
    .collection(COLLECTION.NEWPOSTS)
    .doc(postDocId);
  return newPostRef.set({ [FIELD.DATE]: new Date() });
}

async function sendPostByQuery(
  postDocId: string,
  isUsingExtra: boolean,
  searchFlag: boolean,
): Promise<boolean> {
  let rejectionIds: string[] = await getRejectionIdsByQueryToPosts(postDocId);
  let linkedIds: string[] = await getLinkedIdsByQueryToPosts(postDocId);

  let selectedUserId = null;
  if (!isUsingExtra) {
    selectedUserId = await getSelectedIdByQueryToReceivableUsers({
      searchFlag,
      rejectionIds,
      linkedIds,
    });
  } else {
    selectedUserId = await getSelectedIdByQueryToExtraReceivableUsers({
      searchFlag,
      rejectionIds,
      linkedIds,
    });
  }

  if (selectedUserId != null) {
    log.debug(`send post[${postDocId}] to selected user:  ${selectedUserId}`);

    await setNewPostsCollectionInSelectedUser(selectedUserId, postDocId);
  }

  return selectedUserId != null;
}

async function getRejectionIdsByQueryToPosts(postDocId: string): Promise<string[]> {
  const postRejectionsRef = firestore
    .collection(COLLECTION.POSTS)
    .doc(postDocId)
    .collection(COLLECTION.REJECTIONS);

  const rejectionSnapshot = await postRejectionsRef.get();

  let rejectionIds: string[] = [];
  rejectionSnapshot.forEach((doc) => {
    rejectionIds.push(doc.id);
  });

  return rejectionIds;
}

async function getLinkedIdsByQueryToPosts(postDocId: string): Promise<string[]> {
  const postlinksRef = firestore
    .collection(COLLECTION.POSTS)
    .doc(postDocId)
    .collection(COLLECTION.LINKS);

  const rejectionSnapshot = await postlinksRef.get();

  let linkedIds: string[] = [];
  rejectionSnapshot.forEach((doc) => {
    linkedIds.push(doc.id);
  });

  return linkedIds;
}

interface selectedIdQueryArguments {
  searchFlag?: boolean;
  rejectionIds: string[];
  linkedIds: string[];
}

async function getSelectedIdByQueryToExtraReceivableUsers({
  searchFlag,
  rejectionIds,
  linkedIds,
}: selectedIdQueryArguments) {
  // query to extra
  let selectedDoc = await queryToExtraReceivableUsers({ rejectionIds, linkedIds });

  let selectedUserId = null;
  if (selectedDoc == null) {
    // retry receivable
    selectedDoc = await queryToReceivableUsers({
      searchFlag,
      rejectionIds,
      linkedIds,
    });

    if (selectedDoc != null) {
      selectedUserId = selectedDoc?.id!;

      // update isReceived flag
      const receivableUserRef = firestore
        .collection(COLLECTION.RECEIVABLEUSERS)
        .doc(selectedUserId);

      await receivableUserRef.update({ [FIELD.SEARCHFLAG]: !searchFlag });
    }
  } else {
    selectedUserId = selectedDoc.get(FIELD.USERDOCID);

    // delete selected doc
    selectedDoc.ref.delete();
  }

  return selectedUserId;
}

async function getSelectedIdByQueryToReceivableUsers({
  searchFlag,
  rejectionIds,
  linkedIds,
}: selectedIdQueryArguments) {
  // query
  let selectedDoc = await queryToReceivableUsers({
    searchFlag,
    rejectionIds,
    linkedIds,
  });

  let selectedUserId = null;

  if (selectedDoc == null) {
    // retry to extra
    selectedDoc = await queryToExtraReceivableUsers({ rejectionIds, linkedIds });

    if (selectedDoc != null) {
      selectedUserId = selectedDoc.get(FIELD.USERDOCID);

      // delete selected doc
      selectedDoc.ref.delete();
    }
    // insert pending collection
  } else {
    selectedUserId = selectedDoc?.id!;

    // update isReceived flag
    const receivableUserRef = firestore.collection(COLLECTION.RECEIVABLEUSERS).doc(selectedUserId);

    await receivableUserRef.update({ [FIELD.SEARCHFLAG]: !searchFlag });
  }

  return selectedUserId;
}

async function queryToReceivableUsers({
  searchFlag,
  rejectionIds,
  linkedIds,
}: selectedIdQueryArguments): Promise<admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData> | null> {
  log.debug(`start queryToReceivableUsers method`);
  const receivableUsersCollectionRef = firestore.collection(COLLECTION.RECEIVABLEUSERS);

  const randomKey = receivableUsersCollectionRef.doc().id;
  log.debug(`generated search key : ${randomKey} / searchFlag : ${searchFlag}`);

  const excludingIds = [...rejectionIds, ...linkedIds];

  const gteQuerySnapshot = await receivableUsersCollectionRef
    .where(admin.firestore.FieldPath.documentId(), 'not-in', excludingIds)
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
      .where(admin.firestore.FieldPath.documentId(), 'not-in', excludingIds)
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

async function queryToExtraReceivableUsers({
  rejectionIds,
  linkedIds,
}: selectedIdQueryArguments): Promise<admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData> | null> {
  const extraReceivableUsersCollectionRef = firestore.collection(COLLECTION.EXTRARECEIVABLEUSERS);

  log.debug(`search extra receivable users collection`);
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
        if (rejectionIds.includes(queryResultDocId)) {
          log.debug(`query result id is included in rejection ids : ${queryResultDocId}`);
        } else if (linkedIds.includes(queryResultDocId)) {
          log.debug(`query result id is included in linked ids : ${queryResultDocId}`);
        } else {
          selectedDoc = doc;
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
          if (rejectionIds.includes(queryResultDocId)) {
            log.debug(`query result id is included in rejection ids : ${queryResultDocId}`);
          } else if (linkedIds.includes(queryResultDocId)) {
            log.debug(`query result id is included in linked ids : ${queryResultDocId}`);
          } else {
            selectedDoc = doc;
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
