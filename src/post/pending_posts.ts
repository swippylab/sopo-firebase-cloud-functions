import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { DOCUMENT } from '../constant/document';
import { FIELD } from '../constant/field';
import { SCHEDULED_FUNCTION_QUERY_LIMIT } from '../constant/limit';
import sendPostToUser from './send_post';
const log = functions.logger;
const _firestore = admin.firestore();

export async function handlePendingPosts() {
  // isUsingExtra: boolean,
  // searchFlag: boolean,
  // postDocId: string,
  log.debug(`start pend posts process`);
  const pendingPostsRef = _firestore.collection(COLLECTION.PENDINGPOSTS);

  const pendPostsSnapshot = await pendingPostsRef
    .orderBy(FIELD.DATE)
    .limit(SCHEDULED_FUNCTION_QUERY_LIMIT)
    .get();

  log.debug(`query pending posts size : ${pendPostsSnapshot.size}`);

  let sendBlockFlag: boolean = false;

  for (const doc of pendPostsSnapshot.docs) {
    const p_postDocId = doc.id;
    log.debug;

    const p_result = await sendPostToUser({ postDocId: p_postDocId, isPendingPost: true });

    if (p_result) {
      log.debug(`pending posts[${p_postDocId}] delete`);
      /* await */ doc.ref.delete();
      sendBlockFlag = true;
    }
  }

  // pending post가 하나도 보내지지 않으면 임시로 search flag를 뒤집어서 순환활 수 있도록 돕는다.
  if (!sendBlockFlag) {
    log.debug(`Post does not cycle / reverse searchFlag and reset receivable user searchFlag`);
    const sendPostRef = _firestore.collection(COLLECTION.GLOBALVARIABLES).doc(DOCUMENT.SENDPOST);

    let tempSearchFlag: boolean | undefined = undefined;
    await _firestore.runTransaction(async (transaction) => {
      const sendPostDocument = await transaction.get(sendPostRef);

      const sendPostData = sendPostDocument.data()!;

      // const receivableCount = sendPostData[FIELD.RECEIVABLE_COUNT];
      // const totalReceivable = sendPostData[FIELD.TOTAL_RECEIVABLE];
      const searchFlag = sendPostData[FIELD.SEARCH_FLAG];

      log.debug(`current searchFlag : ${searchFlag} / reserve searchFlag : ${!searchFlag}`);

      // const tempReceivable = totalReceivable - receivableCount;
      tempSearchFlag = searchFlag;

      await transaction.update(sendPostRef, {
        [FIELD.SEARCH_FLAG]: !searchFlag,
        [FIELD.RECEIVABLE_COUNT]: 0,
      });
    });

    const querySnapshot = await _firestore
      .collection(COLLECTION.RECEIVABLEUSERS)
      .where(FIELD.SEARCH_FLAG, '==', tempSearchFlag)
      .get();

    let promiseList: Promise<admin.firestore.WriteResult>[] = [];
    for (const doc of querySnapshot.docs) {
      log.debug(`<${doc.id}> user searchFlag : ${tempSearchFlag} /reserve : ${!tempSearchFlag}`);
      const updatePromise = doc.ref.update({
        [FIELD.SEARCH_FLAG]: !tempSearchFlag,
      });
      promiseList.push(updatePromise);
    }

    await Promise.all(promiseList);
  }

  log.debug(`end pend posts process`);

  // const sendPostRef = firestore.collection(COLLECTION.GLOBALVARIABLES).doc(DOCUMENT.SENDPOST);

  // await firestore.runTransaction(async (transaction) => {
  //   const sendPostDocument = await transaction.get(sendPostRef);

  //   const sendPostData = sendPostDocument.data()!;

  //   searchFlag = sendPostData[FIELD.SEARCH_FLAG];

  //   const totalReceivableCount = sendPostData[FIELD.TOTAL_RECEIVABLE];
  //   const receivableCount = sendPostData[FIELD.RECEIVABLE_COUNT];

  //   log.debug(
  //     `[${postDocId}] after precessing pending post / get send post, searchFlag : ${searchFlag}, receivableCount: ${receivableCount}, totalReceivableCount: ${totalReceivableCount}`,
  //   );
  //   if (totalReceivableCount <= receivableCount) {
  //     // reset count, reverse flag
  //     searchFlag = !searchFlag;

  //     log.debug(
  //       `[${postDocId}] after precessing pending post / reverse searchFlag : ${searchFlag} / reset receivableCount`,
  //     );

  //     transaction.update(sendPostRef, {
  //       [FIELD.SEARCH_FLAG]: searchFlag,
  //       [FIELD.RECEIVABLE_COUNT]: 0,
  //     });
  //   }
  // });
  // return { isUsingExtra, searchFlag };
}
