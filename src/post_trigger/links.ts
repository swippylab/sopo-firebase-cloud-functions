import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';

const log = functions.logger.log;

export const onCreateLinkedUserTrigger = functions.firestore
  .document(`${COLLECTION.POSTS}/{postId}/${COLLECTION.LINKS}/{linksDocId}`)
  .onCreate(async (snap, context) => {
    // store admin firestore
    const firestore = admin.firestore();

    // get wildcard post id
    const postDocumentId = context.params.postId;

    const newLinksDoc = snap.data();
    const newLinkedUserId = newLinksDoc.userId;

    // get post document with post id
    const postDocRef = firestore.collection(COLLECTION.POSTS).doc(postDocumentId);
    // const postDocumentPromise = postDocRef.get();

    // get preview post document with post id
    const previewPostDocRef = firestore.collection(COLLECTION.POSTPREVIEWS).doc(postDocumentId);
    const previewPostDocumnet = await previewPostDocRef.get();

    // get data from preview post document
    const linkedUserIds = previewPostDocumnet.get(FIELD.LINKEDUSREIDS);

    // update preview post Document
    const updateLinkedUserIds = [...linkedUserIds, newLinkedUserId];
    const previewPostUpdateResult = await previewPostDocRef.update({
      linkedUserIds: updateLinkedUserIds,
      linkedCount: updateLinkedUserIds.length,
    });

    if (previewPostUpdateResult.writeTime)
      log(
        `linkedUsers onCreate Trigger occurs: previewPosts/${postDocumentId} update linkedUserIds, spent time : ${previewPostUpdateResult.writeTime.toMillis()}(ms)`,
      );

    // update post document
    const postUpdateResult = await postDocRef.update({
      linkedCount: updateLinkedUserIds.length,
    });

    if (postUpdateResult)
      log(
        `linkedUsers onCreate Trigger occurs: posts/${postDocumentId} update linkedUserIds, spent time : ${postUpdateResult.writeTime.toMillis()}(ms)`,
      );
  });
