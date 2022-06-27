import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { v4 as uuidv4 } from 'uuid';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import sendNewPostArrivedMessage from '../message/new_post_arrived';

const log = functions.logger;

export const onCreatePostTrigger = functions
  .runWith({ failurePolicy: true })
  .firestore.document(`${COLLECTION.POSTS}/{postDocId}`)
  .onCreate(async (snap, context) => {
    // store admin firestore
    const firestore = admin.firestore();
    const batch = firestore.batch();

    // get wildcard post id
    const postDocId = context.params.postDocId;

    // get data from post document
    const newPostData = snap.data();

    // // create preview post
    let createdDate: Date | undefined = undefined;
    // let isActivated: boolean = true;
    // let replyCount: number = 0;
    // let linkedCount: number = 1;
    let userDocId: string = uuidv4();

    // // temp
    if (newPostData[FIELD.CREATED_DATE]) createdDate = newPostData[FIELD.CREATED_DATE];
    else createdDate = new Date();
    // if (newPostData[FIELD.ISACTIVATED]) isActivated = newPostData[FIELD.ISACTIVATED];
    // if (newPostData[FIELD.REPLYCOUNT]) replyCount = newPostData[FIELD.REPLYCOUNT];
    // if (newPostData[FIELD.LINKEDCOUNT]) linkedCount = newPostData[FIELD.LINKEDCOUNT];
    if (newPostData[FIELD.USER_DOC_ID]) userDocId = newPostData[FIELD.USER_DOC_ID];

    // const postPrewviewData = {
    //   [FIELD.CREATEDDATE]: createdDate,
    //   [FIELD.ISACTIVATED]: isActivated,
    //   [FIELD.REPLYCOUNT]: replyCount,
    //   [FIELD.LINKEDCOUNT]: linkedCount,
    //   [FIELD.LINKEDUSERDOCIDS]: [userDocId],
    // };

    // preview post collection
    // const postPreviewCreateRef = firestore.collection(COLLECTION.POSTPREVIEWS).doc(postDocId);

    // myPosts sub collection in user doc
    const userMyPostCreateRef = firestore
      .collection(COLLECTION.USERS)
      .doc(userDocId)
      .collection(COLLECTION.MYPOSTS)
      .doc(postDocId);

    // allPosts sub collection in user doc
    const userAllPostCreateRef = firestore
      .collection(COLLECTION.USERS)
      .doc(userDocId)
      .collection(COLLECTION.ALLPOSTS)
      .doc(postDocId);

    // sub collection in user data
    const userSubCollectionData = { [FIELD.DATE]: createdDate };

    // links sub collection in self
    const postLinkRef = firestore
      .collection(COLLECTION.POSTS)
      .doc(postDocId)
      .collection(COLLECTION.LINKS)
      .doc(userDocId);

    const linkedDate = new Date();
    const postLinkData = { /* [FIELD.USERDOCID]: userDocId,  */ [FIELD.LINKED_DATE]: linkedDate };

    // extra receivable users collection
    const extraReceivableUserRef = firestore.collection(COLLECTION.EXTRARECEIVABLEUSERS).doc();

    const extraReceivableData = {
      [FIELD.USER_DOC_ID]: userDocId,
      [FIELD.CREATED_DATE]: linkedDate,
    };

    // batch.set(postPreviewCreateRef, postPrewviewData);
    batch.set(userMyPostCreateRef, userSubCollectionData);
    batch.set(userAllPostCreateRef, userSubCollectionData);
    batch.set(postLinkRef, postLinkData);
    batch.set(extraReceivableUserRef, extraReceivableData);

    /* const batchResultList =  */ await batch.commit();

    log.debug('batch commit');

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    sendNewPostArrivedMessage(userDocId, postDocId, new Date());

    // await sendPostToUser({ postDocId });

    // batchResultList.forEach((element) => {
    //   if (element.writeTime) log.debug(`write time : ${element.writeTime.toDate()}`);
    // });

    // const previewPostCreateResult = await firestore
    //   .collection(COLLECTION.POSTPREVIEWS)
    //   .doc(postDocumentId)
    //   .set(postPrewviewData)
    //   .catch((err) => {
    //     log.error(err);
    //   });

    // if (previewPostCreateResult) {
    //   log.info(
    //     `previewPosts/${postDocumentId} create, write time : ${previewPostCreateResult.writeTime.toDate()}`,
    //   );
    // }

    // create userMyPost, userAllPost on User sub collection
    // const userMyPostCreateResult = await firestore
    //   .collection(COLLECTION.USERS)
    //   .doc(userDocId)
    //   .collection(COLLECTION.USERMYPOSTS)
    //   .doc(postDocumentId)
    //   .set({ [FIELD.DATE]: createdDate })
    //   .catch((err) => log.error(err));

    // if (userMyPostCreateResult)
    //   log.info(
    //     `users/${userDocId}/userMyPosts/${postDocumentId} create, write time : ${userMyPostCreateResult.writeTime.toDate()}`,
    //   );

    // const userAllPostCreateResult = await firestore
    //   .collection(COLLECTION.USERS)
    //   .doc(userDocId)
    //   .collection(COLLECTION.USERALLPOSTS)
    //   .doc(postDocumentId)
    //   .set({ [FIELD.DATE]: createdDate })
    //   .catch((err) => log.error(err));

    // if (userAllPostCreateResult)
    //   log.info(
    //     `users/${userDocId}/userAllPosts/${postDocumentId} create, write time : ${userAllPostCreateResult.writeTime.toDate()}`,
    //   );
  });
