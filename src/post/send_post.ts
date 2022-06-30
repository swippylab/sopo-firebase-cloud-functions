import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { DOCUMENT } from '../constant/document';
import { FIELD } from '../constant/field';
import sendNewPostArrivedMessage from '../message/new_post_arrived';
const log = functions.logger;
const firestore = admin.firestore();
interface sendPostToUserArgsType {
  postDocId: string;
  // userDocId?: string;
}

export default async function sendPostToUser({
  postDocId,
}: // userDocId: sendUserDocId,
// userDocId: sendUserDocId,
sendPostToUserArgsType) {
  log.debug(`[${postDocId}] start send post`);

  // 보내기 전에 new Posts doc들을 지운다
  // if (sendUserDocId) {
  //   await deleteNewPostInUserAndPendingNewPost(sendUserDocId, postDocId);
  // }

  // 1. get globalVariables/systemPost
  const sendPostRef = firestore.collection(COLLECTION.GLOBALVARIABLES).doc(DOCUMENT.SENDPOST);

  let isUsingExtra = false;
  let searchFlag = false;

  let isProcessPendingPost = false;

  // 2. reserve extra flag, check receivable count
  await firestore.runTransaction(async (transaction) => {
    const sendPostDocument = await transaction.get(sendPostRef);

    const sendPostData = sendPostDocument.data()!;

    isUsingExtra = sendPostData[FIELD.IS_USING_EXTRA];
    searchFlag = sendPostData[FIELD.SEARCH_FLAG];

    const totalReceivableCount = sendPostData[FIELD.TOTAL_RECEIVABLE];
    const receivableCount = sendPostData[FIELD.RECEIVABLE_COUNT];

    log.debug(
      `[${postDocId}] get send post, searchFlag : ${searchFlag}, isUsingExtra : ${isUsingExtra}, receivableCount: ${receivableCount}, totalReceivableCount: ${totalReceivableCount}`,
    );
    if (totalReceivableCount <= receivableCount) {
      // reset count, reverse flag
      searchFlag = !searchFlag;

      log.debug(`[${postDocId}] reverse searchFlag : ${searchFlag} / reset receivableCount`);

      transaction.update(sendPostRef, {
        [FIELD.IS_USING_EXTRA]: !isUsingExtra,
        [FIELD.SEARCH_FLAG]: searchFlag,
        [FIELD.RECEIVABLE_COUNT]: 0,
      });

      isProcessPendingPost = true;
    } else {
      transaction.update(sendPostRef, { [FIELD.IS_USING_EXTRA]: !isUsingExtra });
    }
  });

  // 3. process pending posts
  if (isProcessPendingPost) {
    log.debug(`start pend posts process`);
    const pendingPostsRef = firestore.collection(COLLECTION.PENDINGPOSTS);

    const pendPostsSnapshot = await pendingPostsRef.orderBy(FIELD.CREATED_DATE).get();

    for (const doc of pendPostsSnapshot.docs) {
      const p_postDocId = doc.id;

      const p_result = await sendPostByQuery(p_postDocId, isUsingExtra, searchFlag);

      if (p_result) {
        log.debug(`pending posts[${p_postDocId}] delete`);
        /* await */ doc.ref.delete();
        isUsingExtra = !isUsingExtra;
      }
    }

    log.debug(`end pend posts process`);

    await firestore.runTransaction(async (transaction) => {
      const sendPostDocument = await transaction.get(sendPostRef);

      const sendPostData = sendPostDocument.data()!;

      searchFlag = sendPostData[FIELD.SEARCH_FLAG];

      const totalReceivableCount = sendPostData[FIELD.TOTAL_RECEIVABLE];
      const receivableCount = sendPostData[FIELD.RECEIVABLE_COUNT];

      log.debug(
        `[${postDocId}] after precessing pending post / get send post, searchFlag : ${searchFlag}, receivableCount: ${receivableCount}, totalReceivableCount: ${totalReceivableCount}`,
      );
      if (totalReceivableCount <= receivableCount) {
        // reset count, reverse flag
        searchFlag = !searchFlag;

        log.debug(
          `[${postDocId}] after precessing pending post / reverse searchFlag : ${searchFlag} / reset receivableCount`,
        );

        transaction.update(sendPostRef, {
          [FIELD.SEARCH_FLAG]: searchFlag,
          [FIELD.RECEIVABLE_COUNT]: 0,
        });
      }
    });
  }

  // 4. send post to selected user by query
  const result = await sendPostByQuery(postDocId, isUsingExtra, searchFlag);

  // 5. send to pending posts colleciton
  if (!result) {
    log.debug(`not found send user id / insert pending collection`);
    const pendingPostRef = firestore.collection(COLLECTION.PENDINGPOSTS).doc(postDocId);
    await pendingPostRef.set({ [FIELD.DATE]: new Date() });
  }
}

export async function setDataForSendingPostToUser({
  selectedUserId,
  postDocId,
  receivedDate,
}: {
  selectedUserId: string;
  postDocId: string;
  receivedDate: Date;
}): Promise<
  [admin.firestore.WriteResult, admin.firestore.WriteResult, admin.firestore.WriteResult]
> {
  // user new posts
  const newPostRef = firestore
    .collection(COLLECTION.USERS)
    .doc(selectedUserId)
    .collection(COLLECTION.NEWPOSTS)
    .doc(postDocId);

  // pending new posts
  const pendingNewPostRef = firestore.collection(COLLECTION.PEDINGNEWPOSTS).doc(postDocId);

  // post doc ref
  const postRef = firestore.collection(COLLECTION.POSTS).doc(postDocId);

  const newPostData = { [FIELD.DATE]: receivedDate, [FIELD.IS_ACCEPTED]: null };
  const pendNewPostData = {
    [FIELD.DATE]: receivedDate /* , [FIELD.USER_DOC_ID]: selectedUserId */,
  };
  const postDocData = { [FIELD.CURRENT_RECEIVED_USER_DOC_ID]: selectedUserId };

  const newPostPromise = newPostRef.set(newPostData);
  const pendingNewPostsPromise = pendingNewPostRef.set(pendNewPostData);
  const postPromise = postRef.update(postDocData);

  return Promise.all([newPostPromise, pendingNewPostsPromise, postPromise]);
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
    log.debug('try to search user in receivable');
    selectedUserId = await getSelectedIdByQueryToReceivableUsers({
      searchFlag,
      rejectionIds,
      linkedIds,
    });

    if (selectedUserId == null) {
      log.debug('search fail / retry to search user in extra receivable');
      selectedUserId = await getSelectedIdByQueryToExtraReceivableUsers({
        rejectionIds,
        linkedIds,
      });
    }
  } else {
    log.debug('try to search user in extra receivable');
    selectedUserId = await getSelectedIdByQueryToExtraReceivableUsers({
      rejectionIds,
      linkedIds,
    });

    if (selectedUserId == null) {
      log.debug('search fail / retry to search user in receivable');
      selectedUserId = await getSelectedIdByQueryToReceivableUsers({
        searchFlag,
        rejectionIds,
        linkedIds,
      });
    }
  }

  if (selectedUserId != null) {
    log.debug(`send post[${postDocId}] to selected user:  ${selectedUserId}`);

    const receivedDate = new Date();

    // set data to db for sending post
    await setDataForSendingPostToUser({ selectedUserId, postDocId, receivedDate });

    // send notification
    sendNewPostArrivedMessage(selectedUserId, postDocId, receivedDate);
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

  const linkedSnapshot = await postlinksRef.get();

  log.debug(`[${postDocId}] post links count : ${linkedSnapshot.size}`);

  let linkedIds: string[] = [];
  linkedSnapshot.forEach((doc) => {
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
  rejectionIds,
  linkedIds,
}: selectedIdQueryArguments) {
  // query to extra
  let selectedDoc = await queryToExtraReceivableUsers({ rejectionIds, linkedIds });

  let selectedUserId = null;

  if (selectedDoc != null) {
    selectedUserId = selectedDoc.get(FIELD.USER_DOC_ID);

    // delete selected doc
    await selectedDoc.ref.delete();

    log.debug(`<${selectedUserId}> selected User in Extra Receivable users`);
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

  let selectedUserId: string | null = null;

  if (selectedDoc != null) {
    selectedUserId = selectedDoc?.id!;

    // up receivableCount in globalVariables
    const sendPostRef = firestore.collection(COLLECTION.GLOBALVARIABLES).doc(DOCUMENT.SENDPOST);

    const receivableUserRef = firestore.collection(COLLECTION.RECEIVABLEUSERS).doc(selectedUserId);

    await firestore.runTransaction(async (transaction) => {
      const sendPostDocument = await transaction.get(sendPostRef);

      const receivableCount = sendPostDocument.get(FIELD.RECEIVABLE_COUNT);
      const updateCount = receivableCount + 1;
      transaction.update(sendPostRef, { [FIELD.RECEIVABLE_COUNT]: updateCount });

      log.debug(`<${selectedUserId}> update receivable count in globalVariable : ${updateCount}`);

      // update isReceived flag
      transaction.update(receivableUserRef, { [FIELD.SEARCH_FLAG]: !searchFlag });
      log.debug(`<${selectedUserId}> set searchFlag : ${!searchFlag}`);
    });

    log.debug(`<${selectedUserId}> selected User in Receivable users`);
  }

  return selectedUserId;
}

async function queryToReceivableUsers({
  searchFlag,
  rejectionIds,
  linkedIds,
}: selectedIdQueryArguments): Promise<admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData> | null> {
  log.debug(`search in receivable users collection`);
  const receivableUsersCollectionRef = firestore.collection(COLLECTION.RECEIVABLEUSERS);

  const randomKey = receivableUsersCollectionRef.doc().id;
  log.debug(`generated search key : ${randomKey} / searchFlag : ${searchFlag}`);

  const excludingIds = [...rejectionIds, ...linkedIds];

  const gteQuerySnapshot = await receivableUsersCollectionRef
    .where(admin.firestore.FieldPath.documentId(), 'not-in', excludingIds)
    .where(FIELD.SEARCH_FLAG, '==', searchFlag)
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
      .where(FIELD.SEARCH_FLAG, '==', searchFlag)
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
      .where(admin.firestore.FieldPath.documentId(), '>=', randomKey)
      .limit(1)
      .get();

    log.debug(`extra receivable user search gte size : ${gteQuerySnapshot.size}`);

    if (gteQuerySnapshot.size > 0) {
      gteQuerySnapshot.forEach((doc) => {
        selectedDoc = validateResultFromQueryToExtra(doc, rejectionIds, linkedIds);
      });
    } else {
      const ltQuerySnapshot = await extraReceivableUsersCollectionRef
        .where(admin.firestore.FieldPath.documentId(), '<', randomKey)
        .limit(1)
        .get();

      log.debug(`extra receivable user search lt size : ${ltQuerySnapshot.size}`);

      if (ltQuerySnapshot.size > 0) {
        ltQuerySnapshot.forEach((doc) => {
          selectedDoc = validateResultFromQueryToExtra(doc, rejectionIds, linkedIds);
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

async function validateResultFromQueryToExtra(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
  rejectionIds: string[],
  linkedIds: string[],
): Promise<admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData> | null> {
  const queryResultDocId = doc.get(FIELD.USER_DOC_ID);
  log.debug(`validatioin search extra result id : ${queryResultDocId}`);
  if (rejectionIds.includes(queryResultDocId)) {
    log.debug(`query result id is included in rejection ids : ${queryResultDocId}`);
  } else if (linkedIds.includes(queryResultDocId)) {
    log.debug(`query result id is included in linked ids : ${queryResultDocId}`);
  } else {
    return doc;
  }
  return null;
}
