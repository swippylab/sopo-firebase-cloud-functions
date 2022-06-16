import 'dotenv/config';
import * as admin from 'firebase-admin';
import { COLLECTION } from './constant/collection';
import { DOCUMENT } from './constant/document';
import { FIELD } from './constant/field';
admin.initializeApp();

///initialize global variables document.
const globalVariablesInitialValue = {
  [FIELD.SEARCHFLAG]: false,
  [FIELD.ISUSINGEXTRA]: false,
  [FIELD.TOTAlRECEIVABLE]: 0,
  [FIELD.RECEIVABLECOUNT]: 0,
};

const sendPostref = admin.firestore().collection(COLLECTION.GLOBALVARIABLES).doc(DOCUMENT.SENDPOST);
sendPostref.get().then((doc) => {
  if (!doc.exists) sendPostref.set(globalVariablesInitialValue);
});

// export * from './post/links';
export * from './post/new_posts';
export * from './post/pending_new_posts';
export * from './post/post_creation';
export * from './post/replies';
export * from './user/temp';
export * from './user/user_trigger';
