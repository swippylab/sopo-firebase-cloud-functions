import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import linkCountUpdate from './links';
import sendPostToUser from './send_post';

const log = functions.logger;

// callable function on app
export const newPostHandleUpdateTrigger = functions
  .runWith({ failurePolicy: true })
  .firestore.document(`${COLLECTION.USERS}/{userDocId}/${COLLECTION.NEWPOSTS}/{postDocId}`)
  .onUpdate(async (changed, context) => {
    const firestore = admin.firestore();

    const userDocId: string = context.params.userDocId;
    const postDocId: string = context.params.postDocId;

    const updateData = changed.after.data();
    const receivedDate: Date = updateData.date;
    const isAccepted: boolean = updateData.isAccepted;

    const batch = firestore.batch();

    if (isAccepted) {
      const userSubCollectionData = { [FIELD.DATE]: receivedDate };

      const linkedDate = new Date();
      const postLinkData = { [FIELD.USERDOCID]: userDocId, [FIELD.LINKEDDATE]: linkedDate };

      const userReceivePostRef = firestore
        .collection(COLLECTION.USERS)
        .doc(userDocId)
        .collection(COLLECTION.RECEIVEDPOSTS)
        .doc(postDocId);

      const userAllPostRef = firestore
        .collection(COLLECTION.USERS)
        .doc(userDocId)
        .collection(COLLECTION.ALLPOSTS)
        .doc(postDocId);

      const postLinkRef = firestore
        .collection(COLLECTION.POSTS)
        .doc(postDocId)
        .collection(COLLECTION.LINKS)
        .doc();

      // write at userAllPosts Collection
      batch.set(userAllPostRef, userSubCollectionData);

      // write at userReceivedPosts Collection
      batch.set(userReceivePostRef, userSubCollectionData);

      // write at liniks Collection
      batch.set(postLinkRef, postLinkData);

      log.debug(`ready for isAccepted true`);
    } else {
      const postRejectionRef = firestore
        .collection(COLLECTION.POSTS)
        .doc(postDocId)
        .collection(COLLECTION.REJECTIONS)
        .doc();

      batch.set(postRejectionRef, {
        [FIELD.USERDOCID]: userDocId,
        [FIELD.REJECTEDDATE]: new Date(),
      });

      log.debug(`ready for isAccepted false`);
    }

    const newPostRef = firestore.doc(userDocId).collection(COLLECTION.NEWPOSTS).doc(postDocId);

    // delete userNewPost / common work
    // batch.delete(changed.after.ref); // 작동은 하나 warning 발생
    batch.delete(newPostRef);

    batch.commit();

    log.debug(`new Posts trigger commit`);

    if (isAccepted) {
      log.debug(`start links collection trigger`);
      linkCountUpdate({ firestore, postDocId, userDocId });
    }

    await sendPostToUser({ postDocId, userDocId });
  });
