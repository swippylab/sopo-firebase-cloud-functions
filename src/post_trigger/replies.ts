import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION } from '../constant/collection';

export const onCreateReplyTirgger = functions.firestore
  .document(`${COLLECTION.POSTS}/{postId}/${COLLECTION.REPLIES}/{replyId}`)
  .onCreate(async (snap, context) => {
    // store admin firestore
    const firestore = admin.firestore();

    // get wildcard post id
    const postDocumentId = context.params.postId;

    // get preview post document with post id
    const previewPostDocRef = firestore.collection(COLLECTION.POSTPREVIEWS).doc(postDocumentId);

    // get post document with post id
    const postDocRef = firestore.collection(COLLECTION.POSTS).doc(postDocumentId);
    const postDocumnet = await postDocRef.get();

    // get data from post document
    const replyCount = postDocumnet.get('replyCount');

    // update post document
    const updateReplyCount = replyCount + 1;
    const postUpdateResult = await postDocRef.update({ replyCount: updateReplyCount });

    if (postUpdateResult.writeTime)
      console.log(
        `Occur replies onCreate Trigger : posts/${postDocumentId} update replyCount, spent time : ${postUpdateResult.writeTime
          .toDate()
          .toString()}`,
      );

    // udpate preview post document
    const previewPostUpdateResult = await previewPostDocRef.update({
      replyCount: updateReplyCount,
    });

    console.log(
      `Occur replies onCreate Trigger : previewPosts/${postDocumentId} update replyCount, spent time : ${previewPostUpdateResult.writeTime
        .toDate()
        .toString()}`,
    );
  });
