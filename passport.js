'use strict';

var passport = require('passport'),
  TwitterTokenStrategy = require('passport-twitter-token'),
  twitterConfig = require('./data/twitter.config.js');


var createUser = (token, tokenSecret, profile, verify) => {
  var newUser = {
    name: profile.displayName,
    img: profile._json.profile_image_url,
    twitterProvider: {
      id: profile.id,
      token: token,
      tokenSecret: tokenSecret
    }
  };
  verify(null, newUser);
}

module.exports = function () {

  passport.use(new TwitterTokenStrategy({
      consumerKey: twitterConfig.consumerKey,
      consumerSecret: twitterConfig.consumerSecret,
      includeEmail: true
    },
    function (token, tokenSecret, profile, done) {
      createUser(token, tokenSecret, profile, function(err, user) {
        return done(err, user);
      });
    }));

};
