import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { v4 as uuidv4 } from 'uuid';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import sendPostToUser from './send_post';

const log = functions.logger;
const _firestore = admin.firestore();

export const onCreatePostTrigger = functions
  .runWith({ failurePolicy: true })
  .firestore.document(`${COLLECTION.POSTS}/{postDocId}`)
  .onCreate(async (snap, context) => {
    // store admin firestore

    // get wildcard post id
    const postDocId = context.params.postDocId;

    // get data from post document
    const newPostData = snap.data();

    // // create preview post
    let createdDate: Date | undefined = undefined;

    let userDocId: string = uuidv4();

    // // temp
    if (newPostData[FIELD.CREATED_DATE]) createdDate = newPostData[FIELD.CREATED_DATE];
    else createdDate = new Date();
    if (newPostData[FIELD.USER_DOC_ID]) userDocId = newPostData[FIELD.USER_DOC_ID];

    // sub collection in user data
    const userSubCollectionData = { [FIELD.DATE]: createdDate };

    // allPosts sub collection in user doc
    const userAllPostCreateRef = _firestore
      .collection(COLLECTION.USERS)
      .doc(userDocId)
      .collection(COLLECTION.ALLPOSTS)
      .doc(postDocId);

    const allPromise = userAllPostCreateRef.set(userSubCollectionData);

    // myPosts sub collection in user doc
    const userMyPostCreateRef = _firestore
      .collection(COLLECTION.USERS)
      .doc(userDocId)
      .collection(COLLECTION.MYPOSTS)
      .doc(postDocId);
    const myPromise = userMyPostCreateRef.set(userSubCollectionData);

    // links sub collection in self
    const postLinkRef = _firestore
      .collection(COLLECTION.POSTS)
      .doc(postDocId)
      .collection(COLLECTION.LINKS)
      .doc(userDocId);

    const linkedDate = new Date();
    const postLinkData = { /* [FIELD.USERDOCID]: userDocId,  */ [FIELD.LINKED_DATE]: linkedDate };

    const linksPromise = postLinkRef.set(postLinkData);

    // extra receivable users collection
    const extraReceivableUserRef = _firestore.collection(COLLECTION.EXTRARECEIVABLEUSERS).doc();

    const extraReceivableData = {
      [FIELD.USER_DOC_ID]: userDocId,
      [FIELD.CREATED_DATE]: linkedDate,
    };

    const extraPromise = extraReceivableUserRef.set(extraReceivableData);

    await Promise.all([allPromise, myPromise, linksPromise, extraPromise]);

    log.debug(`[${postDocId} create trigger write / end]`);

    // await new Promise((resolve) => {
    //   setTimeout(resolve, 1000);
    // });

    await sendPostToUser({ postDocId });

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
