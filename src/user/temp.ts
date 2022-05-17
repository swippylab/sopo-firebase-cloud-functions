import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

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
