'use strict';

// models to other modules
var passport = require('passport'),
  express = require('express'),
  jwt = require('jsonwebtoken'),
  expressJwt = require('express-jwt'),
  router = express.Router(),
  cors = require('cors'),
  bodyParser = require('body-parser'),
  request = require('request'),
  twitterConfig = require('./data/twitter.config.js'),
  Twitter = require('twitter-node-client').Twitter;

var passportConfig = require('./passport');


//setup configuration for facebook login
passportConfig();

var app = express();

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// enable cors
var corsOption = {
  origin: true,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  exposedHeaders: ['x-auth-token']
};
app.use(cors(corsOption));

//rest API requirements
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

router.route('/health-check').get(function (req, res) {
  res.status(200);
  res.send('Hello World');
});

var createToken = function (auth) {
  return jwt.sign({
    id: auth.id
  }, 'my-secret',
    {
      expiresIn: 60 * 120
    });
};

var generateToken = function (req, res, next) {
  req.token = createToken(req.auth);
  console.log(req);
  return next();
};

//send back to front-end
var sendToken = function (req, res) {
  res.setHeader('x-auth-token', req.token);
  return res.status(200).send(JSON.stringify(req.user));
};

var twitter = null;

//endpoint for fetching timeline
router.get('/timeline', function (req, res) {
  let aT = req.query.aT;
  let aTS = req.query.aTS;
  let since = req.query.since;
  console.log("***********MAKING TIMELINE REQUEST***********");
  console.log("Using the following credentials:")
  console.log(`token: ${aT}`);
  console.log(`tokenSecret: ${aTS}`);
  console.log('since_id: ' + since);
  console.log("*********************************************")
  //if we haven't intialized twitter connection, do so now

  if (twitter === null) {
    configTwitter(aT, aTS);
  }

  //success function
  var returnTimeline = (data) => {
    //console.log(data);
    return res.send(data);
  }

  //error function
  var error = (err, response, body) => {
    console.log(err.data);
    return res.status(err.statusCode).send(err.data);
  }

  //if request includes a since_id, use it
  if (since) {
    twitter.getHomeTimeline({ since_id: since, tweet_mode: "extended" }, error, returnTimeline);
  }
  //if no since id, default to fetching 10 most recent tweets
  else {
    twitter.getHomeTimeline({ count: '40', tweet_mode: "extended" }, error, returnTimeline);
  }
});

var configTwitter = (aT, aTS) => {
    twitter = new Twitter({
      "consumerKey": twitterConfig.consumerKey,
      "consumerSecret": twitterConfig.consumerSecret,
      "accessToken": aT,
      "accessTokenSecret": aTS,
      "callBackUrl": "http://localhost:4000"
    });
}

//ENDPOINT FOR GETTING LIST OF FRIENDS ****NEEDS TO BE ACCESSED AFTER FETCH TIMELINE****
router.get('/friends/list', function(req, res) {
  let cursor = req.query.cursor;
  let aT = req.query.aT;
  let aTS = req.query.aTS;
  
  console.log('Fetching Friends');
  console.log('CURSOR: ' + cursor);

  if(twitter === null) {
    configTwitter(aT, aTS);
  }

  var successFN = (data) => {
      //console.log(data);
      return res.send(data)
  }

  var error = (error, response, body) => {
    console.log(error);
    return res.status(error.statusCode).send(error.data);
  }

  if(cursor){
    twitter.getCustomApiCall('/friends/list.json', {cursor: cursor}, error, successFN);
  }
  else {
    twitter.getCustomApiCall('/friends/list.json', {}, error, successFN);
  }
});

//first step in authentication
router.route('/auth/twitter/reverse')
  .post(function (req, res) {
    request.post({
      url: 'https://api.twitter.com/oauth/request_token',
      oauth: {
        oauth_callback: "https%3A%2F%2Fisheets.github.io",
        consumer_key: twitterConfig.consumerKey,
        consumer_secret: twitterConfig.consumerSecret
      }
    }, function (err, r, body) {
      if (err) {
        return res.send(500, { message: e.message });
      }

      var jsonStr = '{ "' + body.replace(/&/g, '", "').replace(/=/g, '": "') + '"}';
      res.send(JSON.parse(jsonStr));
    });
  });

//second step 
router.route('/auth/twitter')
  .post((req, res, next) => {
    request.post({
      url: `https://api.twitter.com/oauth/access_token?oauth_verifier`,
      oauth: {
        consumer_key: twitterConfig.consumerKey,
        consumer_secret: twitterConfig.consumerSecret,
        token: req.query.oauth_token
      },
      form: { oauth_verifier: req.query.oauth_verifier }
    }, function (err, r, body) {
      console.log(err);
      if (err) {
        return res.send(500, { message: err.message });
      }

      const bodyString = '{ "' + body.replace(/&/g, '", "').replace(/=/g, '": "') + '"}';
      const parsedBody = JSON.parse(bodyString);

      req.body['oauth_token'] = parsedBody.oauth_token;
      req.body['oauth_token_secret'] = parsedBody.oauth_token_secret;
      req.body['user_id'] = parsedBody.user_id;

      next();
    });
  }, passport.authenticate('twitter-token', { session: false }), function (req, res, next) {
    if (!req.user) {
      return res.send(401, 'User Not Authenticated');
    }


    // prepare token for API
    req.auth = {
      id: req.user.id
    };

    return next();
  }, generateToken, sendToken);

app.use('/api/v1', router);

const server = app.listen(8080, () => {
  const host = server.address().address;
  const port = server.address().port;

  console.log(`Example app listening at http://${host}:${port}`);
});

module.exports = app;

