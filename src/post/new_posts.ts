import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';

const log = functions.logger;

// callable function on app
export const dicisionNewPost = functions
  .runWith({ failurePolicy: true })
  .https.onCall((data, context) => {
    const firestore = admin.firestore();

    const newPostDocId = data.postDocId;
    const sympathy = data.sympathy;
    const receivedDate = data.receivedDate;

    let userDocId;
    if (context.auth?.uid) userDocId = context.auth?.uid!;
    else userDocId = data.userDocId;

    const selectNewPostRef = firestore
      .collection(COLLECTION.USERS)
      .doc(userDocId)
      .collection(COLLECTION.USERNEWPOSTS)
      .doc(newPostDocId);

    // delete document in userNewPosts collection
    selectNewPostRef.delete();

    if (sympathy) {
      // agree post
    } else {
      // reject post
    }
  });
