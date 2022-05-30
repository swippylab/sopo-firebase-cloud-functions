import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION } from '../constant/collection';

export const onCreateLinkedUserTrigger = functions.firestore
  .document(`${COLLECTION.POSTS}/{postId}/${COLLECTION.LINKEDUSERS}/{linkedUserDocId}`)
  .onCreate(async (snap, context) => {
    // store admin firestore
    const firestore = admin.firestore();

    // get wildcard post id
    const postDocumentId = context.params.postId;

    const newLinkedUsersDoc = snap.data();
    const newLinkedUserId = newLinkedUsersDoc.userId;

    // get post document with post id
    const postDocRef = firestore.collection(COLLECTION.POSTS).doc(postDocumentId);
    // const postDocumentPromise = postDocRef.get();

    // get preview post document with post id
    const previewPostDocRef = firestore.collection(COLLECTION.POSTPREVIEWS).doc(postDocumentId);
    const previewPostDocumnet = await previewPostDocRef.get();

    // get data from preview post document
    const linkedUserIds = previewPostDocumnet.get('linkedUserIds');

    // update preview post Document
    const updateLinkedUserIds = [...linkedUserIds, newLinkedUserId];
    const previewPostUpdateResult = await previewPostDocRef.update({
      linkedUserIds: updateLinkedUserIds,
      linkedCount: updateLinkedUserIds.length,
    });

    if (previewPostUpdateResult.writeTime)
      console.log(
        `Occur LinkedUsers onCreate Trigger : previewPosts/${postDocumentId} update linkedUserIds, spent time : ${previewPostUpdateResult.writeTime
          .toDate()
          .toString()}`,
      );

    // update post document
    const postUpdateResult = await postDocRef.update({
      linkedCount: updateLinkedUserIds.length,
    });

    if (postUpdateResult)
      console.log(
        `Occur LinkedUsers onCreate Trigger : post/${postDocumentId} update linkedUserIds, spent time : ${postUpdateResult.writeTime
          .toDate()
          .toString()}`,
      );
  });
