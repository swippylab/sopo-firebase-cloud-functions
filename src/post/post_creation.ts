import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import { v4 as uuidv4 } from 'uuid';
import linksCollectionTrigger from './links';

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

    // create preview post
    let createdDate: Date | undefined = undefined;
    let isActivated: boolean = true;
    let replyCount: number = 0;
    let linkedCount: number = 1;
    let userDocId: string = uuidv4();

    // temp
    if (newPostData[FIELD.CREATEDDATE]) createdDate = newPostData[FIELD.CREATEDDATE];
    else createdDate = new Date();
    if (newPostData[FIELD.ISACTIVEATED]) isActivated = newPostData[FIELD.ISACTIVEATED];
    if (newPostData[FIELD.REPLYCOUNT]) replyCount = newPostData[FIELD.REPLYCOUNT];
    if (newPostData[FIELD.LINKEDCOUNT]) linkedCount = newPostData[FIELD.LINKEDCOUNT];
    if (newPostData[FIELD.USERDOCID]) userDocId = newPostData[FIELD.USERDOCID];

    const postPrewviewData = {
      [FIELD.CREATEDDATE]: createdDate,
      [FIELD.ISACTIVEATED]: isActivated,
      [FIELD.REPLYCOUNT]: replyCount,
      [FIELD.LINKEDCOUNT]: linkedCount,
      [FIELD.LINKEDUSERDOCIDS]: [userDocId],
    };

    const userSubCollectionData = { [FIELD.DATE]: createdDate };

    const linkedDate = new Date();
    const postLinkData = { [FIELD.USERDOCID]: userDocId, [FIELD.LINKEDDATE]: linkedDate };

    const previewPostCreateRef = firestore.collection(COLLECTION.POSTPREVIEWS).doc(postDocId);

    const userMyPostCreateRef = firestore
      .collection(COLLECTION.USERS)
      .doc(userDocId)
      .collection(COLLECTION.USERMYPOSTS)
      .doc(postDocId);

    const userAllPostCreateRef = firestore
      .collection(COLLECTION.USERS)
      .doc(userDocId)
      .collection(COLLECTION.USERALLPOSTS)
      .doc(postDocId);

    const postLinkRef = firestore
      .collection(COLLECTION.POSTS)
      .doc(postDocId)
      .collection(COLLECTION.LINKS)
      .doc();

    batch.set(previewPostCreateRef, postPrewviewData);
    batch.set(userMyPostCreateRef, userSubCollectionData);
    batch.set(userAllPostCreateRef, userSubCollectionData);
    batch.set(postLinkRef, postLinkData);

    const batchResultList = await batch.commit();

    batchResultList.forEach((element) => {
      if (element.writeTime) log.debug(`write time : ${element.writeTime.toDate()}`);
    });

    log.debug(`start links collection trigger`);
    linksCollectionTrigger({ firestore, postDocId, userDocId });

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
