import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
// import sendNewReplyArrivedMessage from '../message/new_reply_arrived';

const log = functions.logger;

export const onCreateReplyTirgger = functions
  .runWith({ failurePolicy: true })
  .firestore.document(`${COLLECTION.POSTS}/{postDocId}/${COLLECTION.REPLIES}/{replyDocId}`)
  .onCreate(async (snap, context) => {
    // store admin firestore
    const firestore = admin.firestore();

    // get wildcard post id
    const postDocumentId = context.params.postDocId;
    // const replyDocId = context.params.replyDocId;

    // const newReplyData = snap.data();

    // const createReplyUserDocId = newReplyData[FIELD.USER_DOC_ID];

    // get post document with post id
    const postDocRef = firestore.collection(COLLECTION.POSTS).doc(postDocumentId);

    // get preview post document with post id
    // const previewPostDocRef = firestore.collection(COLLECTION.POSTPREVIEWS).doc(postDocumentId);

    await firestore.runTransaction(async (transaction) => {
      const postDocumnet = await transaction.get(postDocRef);
      if (!postDocumnet.exists) {
        throw `${COLLECTION.POSTS}/${postDocumentId}} does not exist`;
      }

      // get reply count from post document
      const replyCount = postDocumnet.get(FIELD.REPLY_COUNT);
      const updateReplyCount = replyCount + 1;

      // log.debug(`reply count : ${replyCount} / ${updateReplyCount}`);

      const updateData = {
        [FIELD.REPLY_COUNT]: updateReplyCount,
      };

      // update post Document
      transaction.update(postDocRef, updateData);

      // update preview post Document / field linkedCount
      // transaction.update(previewPostDocRef, updateData);

      log.debug(`update previewPost, post transaction end`);
    });

    // reply push notification
    // sendNewReplyArrivedMessage(postDocumentId, createReplyUserDocId);

    // Todo: interator post/doc/links / send message reply count and reply doc

    // // get post document with post id
    // const postDocRef = firestore.collection(COLLECTION.POSTS).doc(postDocumentId);
    // const postDocumnet = await postDocRef.get();

    // // get data from post document
    // const replyCount = postDocumnet.get(FIELD.REPLYCOUNT);

    // // update post document
    // const updateReplyCount = replyCount + 1;
    // const postUpdateResult = await postDocRef.update({ replyCount: updateReplyCount });

    // if (postUpdateResult.writeTime)
    //   log(
    //     `replies onCreate Trigger occurs : posts/${postDocumentId} update replyCount, spent time : ${postUpdateResult.writeTime.toMillis()}(ms)`,
    //   );

    // // udpate preview post document
    // const previewPostUpdateResult = await previewPostDocRef.update({
    //   replyCount: updateReplyCount,
    // });

    // log(
    //   `replies onCreate Trigger occurs : previewPosts/${postDocumentId} update replyCount, spent time : ${previewPostUpdateResult.writeTime.toMillis()}(ms)`,
    // );
  });
