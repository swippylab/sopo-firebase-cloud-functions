import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION } from '../constant/collection';

export const onCreatePostTrigger = functions.firestore
  .document(`${COLLECTION.POSTS}/{postId}`)
  .onCreate(async (snap, context) => {
    // store admin firestore
    const firestore = admin.firestore();

    // get wildcard post id
    const postDocumentId = context.params.postId;

    // get replies document with post id
    // const repliesDocument = await firestore.collection(COLLECTION_posts).doc(postDocumentId).collection(COLLECTION_replies);

    // get data from post document
    const newPostData = snap.data();

    const postPrewviewData = {
      createdDate: newPostData.createdDate,
      isActivated: newPostData.isActivated,
      replyCount: newPostData.replyCount,
      linkedCount: newPostData.linkedCount,
      linkedUsers: [newPostData.userId],
    };

    firestore.collection(COLLECTION.POSTPREVIEWS).doc(postDocumentId).set(postPrewviewData);
  });
