import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { COLLECTION } from '../constant/collection';
import { FIELD } from '../constant/field';
import sendPostToUser from '../post/send_post';

const log = functions.logger;

export const helloFireStore = functions.https.onRequest(async (request, response) => {
  admin
    .firestore()
    .collection('users')
    .get()
    .then((querySnapshot) => {
      response.send('Hello from FireStore!');
      querySnapshot.forEach((doc) => {
        functions.logger.info(doc.data());
      });
    });
});

export const helloStroage = functions.https.onRequest(async (request, response) => {
  admin
    .storage()
    .bucket('gs://swippylab-sopo.appspot.com')
    .file('users/user1.jpg')
    .get() //'users/user1.jpg')
    .then((responseFile) => {
      response.send('Hello from Storage');
      functions.logger.info(responseFile[0].name);
    });
});

export const queryTest = functions.https.onRequest(async (request, response) => {
  const firestore = admin.firestore();

  const pendNewPostsRef = firestore.collection(COLLECTION.PEDINGNEWPOSTS);

  const searchLimitDate = new Date();
  searchLimitDate.setHours(searchLimitDate.getHours() - 2);

  // // print whole
  // const total = await pendNewPostsRef.get();
  // total.forEach((doc) => {
  //   log.debug(`${doc.get(FIELD.DATE).toDate().toString()}`);
  // });

  log.debug(`search limit time : ${searchLimitDate.toUTCString()}`);

  const querySnapshot = await pendNewPostsRef.where(FIELD.DATE, '<=', searchLimitDate).get();

  querySnapshot.forEach(async (doc) => {
    log.debug(`[${doc.id}] post received date : ${doc.data().date.toDate()}`);

    sendPostToUser({ postDocId: doc.id });
    doc.ref.delete();
  });
  response.send('query result size : ' + querySnapshot.size);
});

export const queryTest2 = functions.https.onRequest(async (request, response) => {
  const receivableUsersCollectionRef = admin.firestore().collection(COLLECTION.RECEIVABLEUSERS);

  // const randomKey = receivableUsersCollectionRef.doc().id;
  // log.debug(`generated search key : ${randomKey} `);

  const excludingIds = [...['ccc', 'bbb'], ...['aaa']];

  const gteQuerySnapshot = await receivableUsersCollectionRef
    .where(admin.firestore.FieldPath.documentId(), 'not-in', excludingIds)
    // .where(FIELD.SEARCHFLAG, '==', searchFlag)
    // .where(admin.firestore.FieldPath.documentId(), '>=', randomKey)
    // .limit(1)
    .get();

  gteQuerySnapshot.forEach((doc) => {
    log.debug(`[${doc.id}]`);
  });

  response.send(`search result size : ${gteQuerySnapshot.size}`);
});
