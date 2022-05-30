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

    // get post document with post id
    const postDocRef = firestore.collection(COLLECTION.POSTS).doc(postDocumentId);
    const postDocumnet = await postDocRef.get();

    // get data from post document
    const replyCount = postDocumnet.get('replyCount');
    const updateReplyCount = replyCount + 1;

    postDocRef.update({ replyCount: updateReplyCount });

    return `Doc Id : ${postDocumentId} / update reply count : ${replyCount} -> ${updateReplyCount}`;
  });
