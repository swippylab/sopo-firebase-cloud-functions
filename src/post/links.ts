import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';

interface linksTriggerArgsType {
  firestore: admin.firestore.Firestore;
  postDocId: string;
  userDocId: string;
}

export default function linksCollectionTrigger({
  firestore,
  postDocId,
  userDocId,
}: linksTriggerArgsType) {
  const log = functions.logger;
  // links collection create trigger
  // get post document with post id
  const postDocRef = firestore.collection(COLLECTION.POSTS).doc(postDocId);
  // const postDocumentPromise = postDocRef.get();

  // get preview post document with post id
  const previewPostDocRef = firestore.collection(COLLECTION.POSTPREVIEWS).doc(postDocId);

  firestore.runTransaction(async (transaction) => {
    const previewPostDoc = await transaction.get(previewPostDocRef);
    if (!previewPostDoc.exists) {
      throw `${COLLECTION.POSTPREVIEWS}/${postDocId}} does not exist`;
    }
    const linkedUserIds = previewPostDoc.get(FIELD.LINKEDUSERDOCIDS);

    // update preview post Document
    const updateLinkedUserIds = [...linkedUserIds, userDocId];
    transaction.update(previewPostDocRef, {
      [FIELD.LINKEDUSERDOCIDS]: updateLinkedUserIds,
      [FIELD.LINKEDCOUNT]: updateLinkedUserIds.length,
    });

    // update post Document / field linkedCount
    transaction.update(postDocRef, {
      [FIELD.LINKEDCOUNT]: updateLinkedUserIds.length,
    });

    log.debug(`update previewPost, post transaction end`);
  });
}

// const log = functions.logger;

// export const onCreateLinkedUserTrigger = functions /* .runWith({failurePolicy}) */.firestore
//   .document(`${COLLECTION.POSTS}/{postDocId}/${COLLECTION.LINKS}/{linksDocId}`)
//   .onCreate(async (snap, context) => {
//     // store admin firestore
//     const firestore = admin.firestore();

//     // get wildcard post id
//     const postDocumentId = context.params.postDocId;

//     const newLinksDoc = snap.data();
//     const newLinkedUserDocId = newLinksDoc.userDocId;

//     // get post document with post id
//     const postDocRef = firestore.collection(COLLECTION.POSTS).doc(postDocumentId);
//     // const postDocumentPromise = postDocRef.get();

//     // get preview post document with post id
//     const previewPostDocRef = firestore.collection(COLLECTION.POSTPREVIEWS).doc(postDocumentId);

//     firestore.runTransaction(async (transaction) => {
//       const previewPostDoc = await transaction.get(previewPostDocRef);
//       if (!previewPostDoc.exists) {
//         throw `${COLLECTION.POSTPREVIEWS}/${postDocumentId}} does not exist`;
//       }
//       const linkedUserIds = previewPostDoc.get(FIELD.LINKEDUSERDOCIDS);

//       // update preview post Document
//       const updateLinkedUserIds = [...linkedUserIds, newLinkedUserDocId];
//       transaction.update(previewPostDocRef, {
//         [FIELD.LINKEDUSERDOCIDS]: updateLinkedUserIds,
//         [FIELD.LINKEDCOUNT]: updateLinkedUserIds.length,
//       });

//       // update post Document / field linkedCount
//       transaction.update(postDocRef, {
//         [FIELD.LINKEDCOUNT]: updateLinkedUserIds.length,
//       });

//       log.debug(`update previewPost, post transaction end`);
//     });

//   });
