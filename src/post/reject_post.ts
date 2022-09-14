import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';

const log = functions.logger;
const _firestore = admin.firestore();

export const onRejectPostTrigger = functions
  .runWith({})
  .firestore.document(`${COLLECTION.POSTS}/{postDocId}/${COLLECTION.REJECTIONS}/{userDocId}}`)
  .onCreate(async (snap, context) => {
    // get wildcard
    const postDocId = context.params.postDocId;
    const userDocId = context.params.userDocId;

    // get data from rejection post document
    // const rejectionPostData = snap.data();

    const allPostDocRef = _firestore
      .collection(COLLECTION.USERS)
      .doc(userDocId)
      .collection(COLLECTION.ALLPOSTS)
      .doc(postDocId);
    const receivedPostDocRef = _firestore
      .collection(COLLECTION.USERS)
      .doc(userDocId)
      .collection(COLLECTION.RECEIVEDPOSTS)
      .doc(postDocId);
    const linkDocRef = _firestore
      .collection(COLLECTION.POSTS)
      .doc(postDocId)
      .collection(COLLECTION.LINKS)
      .doc(userDocId);

    await _firestore.runTransaction(async (transaction) => {
      const allPostDoc = await transaction.get(allPostDocRef);
      const receivedPostDoc = await transaction.get(receivedPostDocRef);
      const linkDoc = await transaction.get(linkDocRef);

      // 해당 doc이 존재 할시 delete
      if (allPostDoc.exists) {
        transaction.delete(allPostDocRef);
      }

      // 해당 doc이 존재 할시 delete
      if (receivedPostDoc.exists) {
        transaction.delete(receivedPostDocRef);
      }

      if (linkDoc.exists) {
        transaction.delete(linkDocRef);
      }

      log.debug(`<${userDocId}> user / reject post : [${postDocId}]`);
    });
  });
