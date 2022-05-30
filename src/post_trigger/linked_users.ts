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

    // get data from post document
    const postData = snap.data();

    // get replies document with post id
    // const repliesDocument = await firestore.collection(COLLECTION_posts).doc(postDocumentId).collection(COLLECTION_replies);

    const updatePostData = {
      ...postData,
      replyCount: postData.replyCount + 1,
    };

    firestore.collection(COLLECTION.POSTS).doc(postDocumentId).set(updatePostData);
  });
