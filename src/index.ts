import 'dotenv/config';
import * as admin from 'firebase-admin';
admin.initializeApp();

export * from './user/temp';
export * from './post/post_creation';
