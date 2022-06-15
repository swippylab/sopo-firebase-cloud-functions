import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { DOCUMENT } from '../constant/document';
import { FIELD } from '../constant/field';
const log = functions.logger;
const firestore = admin.firestore();
interface sendPostToUserArgsType {
  postDocId: string;
  userDocId?: string;
}

export default async function sendPostToUser({
  postDocId,
  userDocId: sendUserDocId,
}: // userDocId: sendUserDocId,
sendPostToUserArgsType) {
  log.debug(`[${postDocId}] start send post`);

  // 보내기 전에 new Posts doc들을 지운다
  if (sendUserDocId) {
    const deleteBatch = firestore.batch();
    // delete userNewPost
    const newPostRef = firestore
      .collection(COLLECTION.USERS)
      .doc(sendUserDocId)
      .collection(COLLECTION.NEWPOSTS)
      .doc(postDocId);
    deleteBatch.delete(newPostRef);
    // batch.delete(changed.after.ref); // warning으로 상위 코드로 대체하였으나 어느순간부터 warning 안뜸

    // delete pending new post
    const pendingNewPostRef = firestore.collection(COLLECTION.PEDINGNEWPOSTS).doc(postDocId);
    deleteBatch.delete(pendingNewPostRef);

    await deleteBatch.commit();
  }

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
      `[${postDocId}] get global variables / send post, searchFlag : ${searchFlag}, isUsingExtra : ${isUsingExtra}, receivableCount: ${receivableCount}, totalReceivableCount: ${totalReceivableCount}`,
    );
    if (totalReceivableCount <= receivableCount) {
      // reset count, reverse flag
      searchFlag = !searchFlag;

      log.debug(`[${postDocId}] reverse searchFlag : ${searchFlag} / reset receivableCount`);

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
        await doc.ref.delete();
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
    await pendingPostRef.set({ [FIELD.CREATEDDATE]: new Date() });
  }
}

export async function setDataForSendingPostToUser(
  selectedUserId: any,
  postDocId: string,
): Promise<[admin.firestore.WriteResult, admin.firestore.WriteResult]> {
  // user new posts
  const newPostRef = firestore
    .collection(COLLECTION.USERS)
    .doc(selectedUserId)
    .collection(COLLECTION.NEWPOSTS)
    .doc(postDocId);

  // pending new posts
  const pendingNewPostRef = firestore.collection(COLLECTION.PEDINGNEWPOSTS).doc(postDocId);

  const receivedDate = new Date();

  const newPostData = { [FIELD.DATE]: receivedDate, [FIELD.ISACCEPTED]: null };
  const pendNewPostData = { [FIELD.DATE]: receivedDate, [FIELD.USERDOCID]: selectedUserId };

  const newPostPromise = newPostRef.set(newPostData);
  const pendingNewPostsPromise = pendingNewPostRef.set(pendNewPostData);
  // return newPostRef.set({ [FIELD.DATE]: new Date() });
  return Promise.all([newPostPromise, pendingNewPostsPromise]);
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
      postDocId,
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
        postDocId,
      });
    }
  }

  if (selectedUserId != null) {
    log.debug(`send post[${postDocId}] to selected user:  ${selectedUserId}`);

    await setDataForSendingPostToUser(selectedUserId, postDocId);

    //Todo: send fcm
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
  postDocId?: string; // log로 인한 temp
}

async function getSelectedIdByQueryToExtraReceivableUsers({
  rejectionIds,
  linkedIds,
}: selectedIdQueryArguments) {
  // query to extra
  let selectedDoc = await queryToExtraReceivableUsers({ rejectionIds, linkedIds });

  let selectedUserId = null;

  if (selectedDoc != null) {
    selectedUserId = selectedDoc.get(FIELD.USERDOCID);

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
  postDocId,
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

      const receivableCount = sendPostDocument.get(FIELD.RECEIVABLECOUNT);
      const updateCount = receivableCount + 1;
      transaction.update(sendPostRef, { [FIELD.RECEIVABLECOUNT]: updateCount });

      log.debug(
        `[${postDocId}] <${selectedUserId}> update receivable count in globalVariable : ${updateCount} / searchFlag : ${searchFlag}`,
      );

      // update isReceived flag
      transaction.update(receivableUserRef, { [FIELD.SEARCHFLAG]: !searchFlag });
      log.debug(`[${postDocId}] <${selectedUserId}> set searchFlag : ${!searchFlag}`);
    });

    log.debug(`[${postDocId}] <${selectedUserId}> selected User in Receivable users`);
  }

  return selectedUserId;
}

export async function queryToReceivableUsers({
  searchFlag,
  rejectionIds,
  linkedIds,
}: selectedIdQueryArguments): Promise<admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData> | null> {
  log.debug(`search in receivable users collection`);
  const receivableUsersCollectionRef = firestore.collection(COLLECTION.RECEIVABLEUSERS);

  const randomKey = receivableUsersCollectionRef.doc().id;
  const excludingIds = [...rejectionIds, ...linkedIds];

  log.debug(
    `generated search key : ${randomKey} / searchFlag : ${searchFlag} / excluding count : ${excludingIds.length}`,
  );

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
  const queryResultDocId = doc.get(FIELD.USERDOCID);
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
