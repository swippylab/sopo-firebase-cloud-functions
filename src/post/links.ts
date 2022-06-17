// import * as admin from 'firebase-admin';
// import * as functions from 'firebase-functions';
// import { COLLECTION } from '../constant/collection';
// import { FIELD } from '../constant/field';

// const firestore = admin.firestore();
// const log = functions.logger;
// interface linkCountUpdateArgsType {
//   postDocId: string;
//   // userDocId: string;
// }

// export default async function updateLinkCountAndPreviewLinkedId({
//   postDocId,
// }: // userDocId,
// linkCountUpdateArgsType) {
//   log.debug(`[${postDocId}] update linked count`);

//   // links collection create trigger
//   // get post document with post id
//   const postDocRef = firestore.collection(COLLECTION.POSTS).doc(postDocId);
//   // const postDocumentPromise = postDocRef.get();

//   // get preview post document with post id
//   // const previewPostDocRef = firestore.collection(COLLECTION.POSTPREVIEWS).doc(postDocId);

//   await firestore.runTransaction(async (transaction) => {
//     const postDoc = await transaction.get(postDocRef);
//     if (!postDoc.exists) {
//       throw `${COLLECTION.POSTS}/${postDocId}} does not exist`;
//     }
//     // const linkedUserIds = postDoc.get(FIELD.LINKEDUSERDOCIDS);
//     const linkedCount = postDoc.get(FIELD.LINKEDCOUNT);

//     const updateLinkedCount = linkedCount + 1;

//     // update preview post Document
//     // let updateLinkedUserIds;
//     // if (linkedUserIds.length >= 4) {
//     //   linkedUserIds.splice(1, linkedUserIds.length - 3);
//     //   updateLinkedUserIds = [...linkedUserIds, userDocId];
//     // } else {
//     //   updateLinkedUserIds = [...linkedUserIds, userDocId];
//     // }

//     // transaction.update(previewPostDocRef, {
//     //   [FIELD.LINKEDUSERDOCIDS]: updateLinkedUserIds,
//     //   [FIELD.LINKEDCOUNT]: updateLinkedCount,
//     // });

//     // update post Document / field linkedCount
//     transaction.update(postDocRef, {
//       [FIELD.LINKEDCOUNT]: updateLinkedCount,
//       [FIELD.LASTCONSECUTIVEREJECTEDTIMES]: 0,
//     });

//     log.debug(`[${postDocId}] update previewPost, post transaction end`);
//   });
// }

// // const log = functions.logger;

// // export const onCreateLinkedUserTrigger = functions /* .runWith({failurePolicy}) */.firestore
// //   .document(`${COLLECTION.POSTS}/{postDocId}/${COLLECTION.LINKS}/{linksDocId}`)
// //   .onCreate(async (snap, context) => {
// //     // store admin firestore
// //     const firestore = admin.firestore();

// //     // get wildcard post id
// //     const postDocumentId = context.params.postDocId;

// //     const newLinksDoc = snap.data();
// //     const newLinkedUserDocId = newLinksDoc.userDocId;

// //     // get post document with post id
// //     const postDocRef = firestore.collection(COLLECTION.POSTS).doc(postDocumentId);
// //     // const postDocumentPromise = postDocRef.get();

// //     // get preview post document with post id
// //     const previewPostDocRef = firestore.collection(COLLECTION.POSTPREVIEWS).doc(postDocumentId);

// //     firestore.runTransaction(async (transaction) => {
// //       const previewPostDoc = await transaction.get(previewPostDocRef);
// //       if (!previewPostDoc.exists) {
// //         throw `${COLLECTION.POSTPREVIEWS}/${postDocumentId}} does not exist`;
// //       }
// //       const linkedUserIds = previewPostDoc.get(FIELD.LINKEDUSERDOCIDS);

// //       // update preview post Document
// //       const updateLinkedUserIds = [...linkedUserIds, newLinkedUserDocId];
// //       transaction.update(previewPostDocRef, {
// //         [FIELD.LINKEDUSERDOCIDS]: updateLinkedUserIds,
// //         [FIELD.LINKEDCOUNT]: updateLinkedUserIds.length,
// //       });

// //       // update post Document / field linkedCount
// //       transaction.update(postDocRef, {
// //         [FIELD.LINKEDCOUNT]: updateLinkedUserIds.length,
// //       });

// //       log.debug(`update previewPost, post transaction end`);
// //     });

// //   });
