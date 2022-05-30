import 'dotenv/config';
import * as admin from 'firebase-admin';
admin.initializeApp();

export * from './user/temp';
export * from './post_trigger/post_creation';
export * from './post_trigger/replies';
export * from './post_trigger/links';
