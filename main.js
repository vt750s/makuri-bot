const Twitter = require('twitter-lite');
const log4js = require('log4js')
const logger = log4js.getLogger();
logger.level = 'info';
const fs = require('fs');

const USERNAME = process.env.MB_USERNAME;
const CONSUMER_KEY = process.env.MB_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MB_CONSUMER_SECRET;
const ACCESS_TOKEN_KEY = process.env.MB_ACCESS_TOKEN_KEY;
const ACCESS_TOKEN_SECRET = process.env.MB_ACCESS_TOKEN_SECRET;

const clientV1 = new Twitter({ // for DM API
  consumer_key: CONSUMER_KEY,
  consumer_secret: CONSUMER_SECRET,
  access_token_key: ACCESS_TOKEN_KEY,
  access_token_secret: ACCESS_TOKEN_SECRET
});

const clientV2 = new Twitter({ // for the other APIs
  version: "2", // version "1.1" is the default (change for v2)
  extension: false, // true is the default (this must be set to false for v2 endpoints)
  consumer_key: CONSUMER_KEY,
  consumer_secret: CONSUMER_SECRET,
  access_token_key: ACCESS_TOKEN_KEY,
  access_token_secret: ACCESS_TOKEN_SECRET
});

var invitedUserSet = new Set();
var errorUserSet = new Set();
var targetTweetId = undefined;

async function sendInvitationByDm(recipient_id) {
  let msg = fs.readFileSync('./message.txt');
  await clientV1.post("direct_messages/events/new", {
    event: {
      type: "message_create",
      message_create: {
        target: { recipient_id: recipient_id },
        message_data: {
          text: msg.toString()
        }
      }
    }
  });
}

async function sendErrorByTweet(parentTweetId, username) {
  let tweet = fs.readFileSync('./tweet_error.txt');
  await sendTweet(parentTweetId, '@' + username + ' ' + tweet);
}

async function sendSuccessByTweet(parentTweetId, username) {
  let tweet = fs.readFileSync('./tweet_success.txt');
  await sendTweet(parentTweetId, '@' + username + ' ' + tweet);
}

async function sendTweet(parentTweetId, tweet) {
  await clientV1.post("statuses/update", {
    status: tweet,
    in_reply_to_status_id: parentTweetId,
    auto_populate_reply_metadata: false
  });
}

async function monitorLike() {
  // get id of monitoring target tweet
  if (targetTweetId === undefined) {
    let myUser = await clientV2.get("users/by/username/" + USERNAME);
    let myUserId = myUser.data.id;
    let myTweets = await clientV2.get("users/" + myUserId + "/tweets?max_results=100&tweet.fields=created_at,in_reply_to_user_id");
    for (let tweet of myTweets.data) {
      if (tweet.hasOwnProperty('in_reply_to_user_id') === false) {
        logger.info('Target tweet is ' + JSON.stringify(tweet));
        targetTweetId = tweet.id;
        break;
      }
    }
  }
  // get liking users of target tweet
  let users = await clientV2.get("tweets/" + targetTweetId + "/liking_users");
  if (users.meta.result_count === 0) {
    return;
  }
  for (let user of users.data) {
    if (invitedUserSet.has(user.id)) { // skip user who has already received DM
      continue;
    }
    try {
      await sendInvitationByDm(user.id);
      // await sendSuccessByTweet(targetTweetId, user.username);
      invitedUserSet.add(user.id);
      logger.info('Success to invite user: ' + JSON.stringify(user));
    } catch (e) {
      logger.warn('Failed to invite user: ' + JSON.stringify(user));
      if (errorUserSet.has(user.id)) {
        continue;
      }
      errorUserSet.add(user.id);
      try {
        await sendErrorByTweet(targetTweetId, user.username);
        logger.info('Success to send ERROR reply for user: ' + JSON.stringify(user));
      } catch (e2) {
        logger.warn('Failed to send ERROR reply for user: ' + JSON.stringify(user));
      }
    }
  }
}

setInterval(monitorLike, 20000);
