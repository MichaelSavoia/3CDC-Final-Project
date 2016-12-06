const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const expressSession = require('express-session');
const cons = require('consolidate');
const logger = require('morgan');
const jwt = require('jwt-simple');
const request = require('request');
const mongoose = require('mongoose');
const moment = require('moment');
const qs = require('querystring');
const path = require('path');

require('dotenv').config();


app.set('views',__dirname+'/views');
app.engine('html',cons.mustache);
app.set('view engine','html');

app.use(express.static(path.join(__dirname,'app')))

const User          = require('./models/user');
const PollQuestion  = require('./models/pollQuestion');
const PollOption    = require('./models/pollOption');

app.use(cors());

app.use( bodyParser.json() );  

app.use(bodyParser.urlencoded({     
  extended: true
})); 

mongoose.Promise = global.Promise;
mongoose.connect(process.env.MONGO_URL);



// ------------------------------------------------------------
// ------------------------------------------------------------
//
// POLL API
//
// ------------------------------------------------------------
// ------------------------------------------------------------

// ------------------------------------------------------------
// GET: /api/polls
// Returns all poll questions
// ------------------------------------------------------------
app.get('/api/polls', (req, res) => {
  PollQuestion
  .find()
  .populate('_pollOptions')
  .sort({ pollQuestionSortOrder: 1 })
  .exec((err, response) => {
    if (err) return res.send(err);
    res.json(response);
  })
})



// ------------------------------------------------------------
// POST: /api/poll
// Adds a new question and it's options to the database
// ------------------------------------------------------------
app.post('/api/poll', (req, res) => {

  // --------------------
  // Step 1: Save Poll Question
  // --------------------
  PollQuestion
  .findOne({})
  .sort('-pollQuestionSortOrder')  // give me the max
  .exec(function (err, response) {
    if (err) return res.send(err);

    // Initiate newSortIndex as 1
    let newSortIndex = 1;

    // Was anything found?
    if(response !== null) {
      // Yes, did response come back with number?
      if(typeof response.pollQuestionSortOrder === 'number') {
        // Yes, add response number to newSortIndex
        newSortIndex = response.pollQuestionSortOrder + 1;
      }
    }

    // Build pollQuestion object
    let pollQuestion = {
      pollQuestion: req.body.pollQuestion,
      pollQuestionSortOrder: newSortIndex,
      _pollOptions: []
    };

    // Insert pollQuestion
    PollQuestion.collection.insert(pollQuestion, callback)

    // Callback response
    function callback(err, docs) {
      if (err) {
        res.send({error:err})
      } else {

        // --------------------
        // Step 2: Save Poll Options
        // --------------------
        let pollQuestionID = docs.ops[0]._id;
        let pollOptions    = JSON.parse(req.body.pollOptions);
        let pollOptionList = [];

        pollOptions.forEach((option, index) => {
          // Load new PollQuestion object
          let pollOption = {
            pollOption: pollOptions[index].pollOption,
            pollOptionSelectCount: 0,                     // Initially set to zero
            pollOptionSortOrder: index + 1,
            _pollQuestion: pollQuestionID
          };

          // Push into array
          pollOptionList.push(pollOption);
        })

        // Insert array to PollOption collection
        PollOption.collection.insert(pollOptionList, callback);

        function callback(err, docs) {
          if (err) {
            res.send({error:err})
          } else {
            // Save option's ObjectID in PollQuestion for referencing
            PollQuestion
            .findById(pollQuestionID)
            .populate('_pollOptions')
            .exec((err, question) => {
              question._pollOptions = docs.ops;
              question.save(function(err,response){
                if (err) {
                  res.send({error:err});
                  return;
                };

                res.send({success:"Poll options successfully added"})
              });
            })
          }
        }
      }
    }
  });
})



// ------------------------------------------------------------
// POST: /api/poll/vote
// Increments an options vote count by 1
// ------------------------------------------------------------
app.post('/api/poll/vote', (req, res) => {

  PollOption
  .findById(req.body.pollOptionID)
  .exec((err, option) => {
    option.pollOptionSelectCount += 1;
    option.save(function(err,response){
      if (err) {
        res.send({error:err});
        return;
      };

      User
      .findById(req.body.userID)
      .exec((err, user) => {
        user._pollOptions.push(response);
        user.save(function(err, response){
          if (err) {
            res.send({error:err});
            return;
          }

          res.send({success:"Vote successfully counted"})
        })
      })
    });
  })
})



// ------------------------------------------------------------
// POST: /api/poll/update
// Updates a question on the database
// ------------------------------------------------------------
// app.post('/api/poll/update', (req, res) => {

//   PollQuestion
//   .findById(req.body.pollQuestionID)
//   .exec(function (err, response) {
//     if (err) return res.send(err);

//     // Update fields
//     response.pollQuestion           = req.body.pollQuestion;

//     // Save if no errors
//     response.save((err) => {
//       if (err) {
//         res.send({error:err});
//         return;
//       };
//       res.send({success:"Poll question successfully added"})
//     });

//   });
// })



// ------------------------------------------------------------
// ------------------------------------------------------------
//
// AUTHENTICATION
//
// ------------------------------------------------------------
// ------------------------------------------------------------

// ------------------------------------------------------------
// Name: ensureAuthenticated
// Middleware that ensures a user is logged in to progress
// ------------------------------------------------------------
function ensureAuthenticated(req, res, next) {
  if (!req.header('Authorization')) {
    return res.status(401).send({ message: 'Please make sure your request has an Authorization header' });
  }
  var token = req.header('Authorization').split(' ')[1];

  var payload = null;
  try {
    payload = jwt.decode(token, config.TOKEN_SECRET);
  }
  catch (err) {
    return res.status(401).send({ message: err.message });
  }

  if (payload.exp <= moment().unix()) {
    return res.status(401).send({ message: 'Token has expired' });
  }
  req.user = payload.sub;
  next();
}



// ------------------------------------------------------------
// Name: createJWT
// Generates a JSON Web Token
// ------------------------------------------------------------
function createJWT(user) {
  var payload = {
    sub: user._id,
    iat: moment().unix(),
    exp: moment().add(14, 'days').unix()
  };
  return jwt.encode(payload, process.env.TOKEN_SECRET);
}



// ------------------------------------------------------------
// GET: /api/me
// Returns logged in user's details
// ------------------------------------------------------------
app.get('/api/me', ensureAuthenticated, function(req, res) {
  User.findById(req.user, function(err, user) {
    res.send(user);
  });
});



// ------------------------------------------------------------
// PUT: /api/me
// Updates logged in user's details
// ------------------------------------------------------------
app.put('/api/me', ensureAuthenticated, function(req, res) {
  User.findById(req.user, function(err, user) {
    if (!user) {
      return res.status(400).send({ message: 'User not found' });
    }
    user.displayName = req.body.displayName || user.displayName;
    user.email = req.body.email || user.email;
    user.save(function(err) {
      res.status(200).end();
    });
  });
});



// ------------------------------------------------------------
// POST: /auth/login
// Log into app with email
// ------------------------------------------------------------
app.post('/auth/login', function(req, res) {
  User.findOne({ email: req.body.email }, 'password', function(err, user) {
    if (!user) {
      return res.status(401).send({ message: 'Invalid email and/or password' });
    }
    user.comparePassword(req.body.password, function(err, isMatch) {
      if (!isMatch) {
        return res.status(401).send({ message: 'Invalid email and/or password' });
      }
      res.send({ token: createJWT(user) });
    });
  });
});



// ------------------------------------------------------------
// POST: /auth/signup
// Create new email and password Account
// ------------------------------------------------------------
app.post('/auth/signup', function(req, res) {
  User.findOne({ email: req.body.email }, function(err, existingUser) {
    // Does user already exist?
    if (existingUser) {
      // Let user know email is already used
      return res.status(409).send({ message: 'Email is already taken' });
    }

    // Build uesr
    var user = new User({
      displayName: req.body.displayName,
      email: req.body.email,
      password: req.body.password
    });

    // Was no password saved?
    if(!user.password) {
      // Let user know password is required
      return res.status(401).send({ message: 'A password is required' });
    }

    // Save user
    user.save(function(err, result) {
      if (err) {
        res.status(500).send({ message: err.message });
      }
      // Send user their token
      res.send({ token: createJWT(result) });
    });
  });
});



// ------------------------------------------------------------
// POST: /auth/facebook
// Login with Facebook
// ------------------------------------------------------------
app.post('/auth/facebook', function(req, res) {
  var fields = ['id', 'email', 'first_name', 'last_name', 'link', 'name'];
  var accessTokenUrl = 'https://graph.facebook.com/v2.5/oauth/access_token';
  var graphApiUrl = 'https://graph.facebook.com/v2.5/me?fields=' + fields.join(',');
  var params = {
    code: req.body.code,
    client_id: req.body.clientId,
    client_secret: process.env.FACEBOOK_CLIENT_SECRET,
    redirect_uri: req.body.redirectUri
  };

  // Step 1. Exchange authorization code for access token.
  request.get({ url: accessTokenUrl, qs: params, json: true }, function(err, response, accessToken) {
    if (response.statusCode !== 200) {
      return res.status(500).send({ message: accessToken.error.message });
    }

    // Step 2. Retrieve profile information about the current user.
    request.get({ url: graphApiUrl, qs: accessToken, json: true }, function(err, response, profile) {
      if (response.statusCode !== 200) {
        return res.status(500).send({ message: profile.error.message });
      }

      if (req.header('Authorization')) {
        // Step 3a. Link user accounts.
        User.findOne({ email: req.body.email }, function(err, existingUser) {
          if (existingUser) {
            return res.status(409).send({ message: 'There is already a Facebook account that belongs to you' });
          }

          var token = req.header('Authorization').split(' ')[1];
          var payload = jwt.decode(token, config.TOKEN_SECRET);

          User.findById(payload.sub, function(err, user) {
            if (!user) {
              return res.status(400).send({ message: 'User not found' });
            }

            user.displayName = profile.name;          
            user.email       = profile.email;
            user.facebook    = profile.id;
            user.save(function(err) {
              if (err) {
                res.status(500).send({ message: err.message });
                return false;
              }
              var token = createJWT(user);
              res.send({ token: token });
            });
          });
        });
      } else {
        // Step 3b. Create a new user account or return an existing one.
        User.findOne({ email: req.body.email }, function(err, existingUser) {
          if (existingUser) {
            var token = createJWT(existingUser);
            return res.send({ token: token });
          }
          
          var user          = new User();
          user.displayName  = profile.name;          
          user.email        = profile.email;
          user.facebook     = profile.id;

          user.save(function(err) {
            if (err) {
              res.status(500).send({ message: err.message });
              return false;
            }
            var token = createJWT(user);
            res.send({ token: token });
          });
        });
      }
    });
  });
});

// ------------------------------------------------------------
// POST: /auth/twitter
// Login with Twitter
// ------------------------------------------------------------
app.post('/auth/twitter', function(req, res) {
  var requestTokenUrl = 'https://api.twitter.com/oauth/request_token';
  var accessTokenUrl = 'https://api.twitter.com/oauth/access_token';
  var profileUrl = 'https://api.twitter.com/1.1/account/verify_credentials.json';

  // Part 1 of 2: Initial request from Satellizer.
  if (!req.body.oauth_token || !req.body.oauth_verifier) {
    var requestTokenOauth = {
      consumer_key: process.env.TWITTER_CONSUMER_KEY,
      consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
      callback: req.body.redirectUri
    };

    // Step 1. Obtain request token for the authorization popup.
    request.post({ url: requestTokenUrl, oauth: requestTokenOauth }, function(err, response, body) {
      var oauthToken = qs.parse(body);

      // Step 2. Send OAuth token back to open the authorization screen.
      res.send(oauthToken);
    });
  } else {
    // Part 2 of 2: Second request after Authorize app is clicked.
    var accessTokenOauth = {
      consumer_key: process.env.TWITTER_CONSUMER_KEY,
      consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
      token: req.body.oauth_token,
      verifier: req.body.oauth_verifier
    };

    // Step 3. Exchange oauth token and oauth verifier for access token.
    request.post({ url: accessTokenUrl, oauth: accessTokenOauth }, function(err, response, accessToken) {

      accessToken = qs.parse(accessToken);

      var profileOauth = {
        consumer_key: process.env.TWITTER_CONSUMER_KEY,
        consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
        token: accessToken.oauth_token,
        token_secret: accessToken.oauth_token_secret,
      };

      // Step 4. Retrieve user's profile information and email address.
      request.get({
        url: profileUrl,
        qs: { include_email: true },
        oauth: profileOauth,
        json: true
      }, function(err, response, profile) {

        // Step 5a. Link user accounts.
        if (req.header('Authorization')) {
          User.findOne({ email: req.body.email }, function(err, existingUser) {
            if (existingUser) {
              return res.status(409).send({ message: 'There is already a Twitter account that belongs to you' });
            }

            var token = req.header('Authorization').split(' ')[1];
            var payload = jwt.decode(token, config.TOKEN_SECRET);

            User.findById(payload.sub, function(err, user) {
              if (!user) {
                return res.status(400).send({ message: 'User not found' });
              }

              user.twitter      = profile.id;
              user.email        = profile.email;
              user.displayName  = profile.name;
              user.save(function(err) {
                if (err) {
                  res.status(500).send({ message: err.message });
                  return false;
                }
                res.send({ token: createJWT(user) });
              });
            });
          });
        } else {
          // Step 5b. Create a new user account or return an existing one.
          User.findOne({ email: req.body.email }, function(err, existingUser) {
            if (existingUser) {
              return res.send({ token: createJWT(existingUser) });
            }

            var user          = new User();
            user.twitter      = profile.id;
            user.email        = profile.email;
            user.displayName  = profile.name;
            user.save(function(err) {
              if (err) {
                res.status(500).send({ message: err.message });
                return false;
              }
              res.send({ token: createJWT(user) });
            });
          });
        }
      });
    });
  }
});


app.get('/', function(req, res) {
  res.render('index.html')
});



// Get or Set port #
const port = process.env.PORT || 8000;

// Initiate server 
app.listen(port, () => {
  console.log('Server running on port ' + port + '!');
})