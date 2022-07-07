import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import sendPostToUser from './send_post';
const log = functions.logger;
const firestore = admin.firestore();

export async function handlePendingPosts() {
  // isUsingExtra: boolean,
  // searchFlag: boolean,
  // postDocId: string,
  log.debug(`start pend posts process`);
  const pendingPostsRef = firestore.collection(COLLECTION.PENDINGPOSTS);

  const pendPostsSnapshot = await pendingPostsRef.orderBy(FIELD.DATE).get();

  for (const doc of pendPostsSnapshot.docs) {
    const p_postDocId = doc.id;
    log.debug;

    const p_result = await sendPostToUser({ postDocId: p_postDocId });

    if (p_result) {
      log.debug(`pending posts[${p_postDocId}] delete`);
      /* await */ doc.ref.delete();
    }
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
