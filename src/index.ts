import 'dotenv/config';
import * as admin from 'firebase-admin';
admin.initializeApp();

// export * from './post/links';
export * from './post/new_posts';
export * from './post/pending_new_posts';
export * from './post/post_creation';
export * from './post/replies';
export * from './user/temp';
export * from './user/user_trigger';
