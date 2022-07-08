import * as functions from 'firebase-functions';
import { handlePendingNewPosts } from './pending_new_posts';
import { handlePendingPosts } from './pending_posts';

const executionDelayHour = 2;

export const onShceduledHandlePendingNewPosts = functions
  .runWith({ timeoutSeconds: 540 })
  .pubsub // .schedule(`every ${executionDelayHour} minutes`)
  // .schedule(`every ${executionDelayHour} hours`)
  .schedule(`0 */${executionDelayHour} * * *`)
  // .schedule(`* * * * *`)
  .onRun(async (/* context */) => {
    await handlePendingNewPosts();
  });

export const onShceduledHandledPendingPosts = functions
  .runWith({ timeoutSeconds: 540 })
  .pubsub // .schedule(`every ${executionDelayHour} minutes`)
  // .schedule(`every ${executionDelayHour} hours`)
  .schedule(`0 1-23/${executionDelayHour} * * *`)
  // .schedule(`* * * * *`)
  .onRun(async (/* context */) => {
    await handlePendingPosts();
  });
