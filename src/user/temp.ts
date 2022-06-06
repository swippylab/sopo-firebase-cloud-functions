import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

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
  const userRef = admin.firestore().collection('users');
  const randomKey = userRef.doc().id;
  const snapshot = await userRef
    .where(admin.firestore.FieldPath.documentId(), '!=', 'aaa')
    .where('useBool', '==', !false)
    .where(admin.firestore.FieldPath.documentId(), '>=', randomKey)
    // .limit(1)
    .get();

  functions.logger.debug(`query snap shot size : ${snapshot.size}`);
  snapshot.forEach((doc) => {
    functions.logger.debug(`id: ${doc.id} / data : ${doc.data().toString()}`);
  });

  // const snapshot2 = await userRef
  //   .where(admin.firestore.FieldPath.documentId(), '<', randomKey)
  //   .limit(1)
  //   .get();

  // functions.logger.debug(`query snap shot2 size : ${snapshot2.size}`);
  // snapshot2.forEach((doc) => {
  //   functions.logger.debug(`id: ${doc.id} / data : ${doc.data().toString()}`);
  // });

  response.send('query result size : ' + snapshot.size /*  + '/ result 2 : ' + snapshot2.size */);
});
