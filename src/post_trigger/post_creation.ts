import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';

const log = functions.logger.log;

export const onCreatePostTrigger = functions.firestore
  .document(`${COLLECTION.POSTS}/{postId}`)
  .onCreate(async (snap, context) => {
    // store admin firestore
    const firestore = admin.firestore();

    // get wildcard post id
    const postDocumentId = context.params.postId;

    // get data from post document
    const newPostData = snap.data();

    let createdDate: Date | undefined = undefined;
    let isActivated: boolean = true;
    let replyCount: number = 0;
    let linkedCount: number = 1;
    let userId: String | undefined = undefined;

    if (newPostData[FIELD.CREATEDDATE]) createdDate = newPostData[FIELD.CREATEDDATE];
    else createdDate = new Date();
    if (newPostData[FIELD.ISACTIVEATED]) isActivated = newPostData[FIELD.ISACTIVEATED];
    if (newPostData[FIELD.REPLYCOUNT]) replyCount = newPostData[FIELD.REPLYCOUNT];
    if (newPostData[FIELD.LINKEDCOUNT]) linkedCount = newPostData[FIELD.LINKEDCOUNT];
    if (newPostData[FIELD.USERID]) userId = newPostData[FIELD.USERID];
    else userId = 'guest';

    const postPrewviewData = {
      [FIELD.CREATEDDATE]: createdDate,
      [FIELD.ISACTIVEATED]: isActivated,
      [FIELD.REPLYCOUNT]: replyCount,
      [FIELD.LINKEDCOUNT]: linkedCount,
      [FIELD.LINKEDUSREIDS]: [userId],
    };

    const previewPostCreateResult = await firestore
      .collection(COLLECTION.POSTPREVIEWS)
      .doc(postDocumentId)
      .set(postPrewviewData);

    if (previewPostCreateResult.writeTime)
      log(
        `posts onCreate Trigger occurs : previewPosts/${postDocumentId} create, spent time : ${previewPostCreateResult.writeTime.toMillis()}(ms)`,
      );
  });
