var express = require("express"); // imports express
var app = express();        // create a new instance of express
var http = require('http');
var fs = require("fs");
var path = require('path');

var assert = require('./assertNode.js');

// for questions Erik made
var easyEnglishQuestionsPath =
    '/users/teacher_content.json?name=epintar&include_content_sets=true';

/* set up database */
// uri string: 
// mongodb://<dbuser>:<dbpassword>@dbh85.mongolab.com:27857/edugamify
var mongo = require('mongodb');
var mongoHost = 'dbh85.mongolab.com';
var mongoPort = 27857;
// for weird thing later in getGameData
var BSON = mongo.BSONPure;

var options = { w: 1 };
var ourCollName = 'minigameData';
var DB_NAME = 'edugamify';
var username = 'admin';
var password = 'kosbie';

var mongoServer = new mongo.Server(mongoHost, mongoPort);
var mongoClient = new mongo.Db(
    DB_NAME,
    mongoServer,
    options
);

// ****
// MONGO EXPRESS AUTHENTICATION
// basically just copied a lot of Evan Shapiro's code from
// https://github.com/es92/mongo-express-auth
// and modified it for this project
// ***

var mongoExpressAuth = require('mongo-express-auth');
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({ secret: 'secrets secrets are no fun' }));

// login uses a username and password and attempts to log in the database
app.post('/login', function(req, res){
    mongoExpressAuth.login(req, res, function(err){
        if (err)
            res.send(err);
        else
            res.send('ok');
    });
});

// registers a new user
app.post('/register', function(req, res){
    mongoExpressAuth.register(req, function(err){
        if (err)
            res.send(err);
        else
            res.send('ok');
    });
});

// logs out user
app.post('/logout', function(req, res){
    mongoExpressAuth.logout(req, res);
    res.send('ok');
});

// GETS whether the user is logged in, and what their account info is
app.get('/me', function(req, res){
    mongoExpressAuth.checkLogin(req, res, function(err){
        if (err)
            res.send(err);
        else {
            mongoExpressAuth.getAccount(req, function(err, result){
                if (err)
                    res.send(err);
                else 
                    res.send(result);
            });
        }
    });
});

/** allows us to serve all files from the static directory
 * in other words, we can access our server at http://localhost:8889/index.html
 * instead of http://localhost:8889/static/index.html
 * See here for more details: https://piazza.com/class#spring2013/15237/168
**/
app.use(express.static(path.join(__dirname, 'static')));

var ALL_COLLECTIONS_DATA = null;
var ALL_COLLECTIONS_NAMES = ['minigameData', 'accountProfiles', 'questions'];
var QUESTION_DATA = null;


// either creates or updates the given minigame data, based whether an id is 
// given. On success, sends the mongo id of the updated gamedata document
app.post("/saveGameData", function(request, response){
    var gameData;
    if("gameData" in request.body){
        gameData = request.body["gameData"];
    }
    else{
        response.send(400, "missing data");
        return;
    }
    
    var _createGame = function(_gameData){
        minigameCollection.insert(_gameData, {"safe":true}, function(err,docs){
            if(err){
                response.send(500, "insert error");
            }
            else{
                //console.log("created", docs[0]._id);
                response.send({
                    "status": "ok",
                    "id": docs[0]._id
                });
            }
        });
    };
    
    var minigameCollection = ALL_COLLECTIONS_DATA.minigameData;
    
    // if given existing id, update the corresponding game's data
    if("id" in request.body){
        
        var gameId = request.body['id'];
        var mongolabId = new BSON.ObjectID(gameId);
        minigameCollection.findOne({"_id": mongolabId}, function(findErr, doc){
            if(findErr){
                response.send(500, "finding/update error");
            }
            if(doc !== null){
                minigameCollection.update({"_id": mongolabId}, {$set: gameData}, function(err){
                    if(err){
                        response.send(500, "update error");
                    }
                    else{
                        response.send({
                            "status": "ok",
                            "id": gameId
                        });
                    }
                });
            }
            else{
                _createGame(gameData);
            }
        
        });
    }
    
    // if not given an id, create a new one
    else {
        _createGame(gameData);
    }
});

// GETS a minigame object from the database given a mongo id
app.get("/getGameData/:mongoId", function (request, response){

    var minigameCollection = ALL_COLLECTIONS_DATA.minigameData;
    var mongoId = request.params.mongoId;

    // if given existing id, update the corresponding game's data
    if ("mongoId" !== undefined) {
        // weird thing you have to do to find the id (it's nested)
        var o_id = new BSON.ObjectID(mongoId);
        minigameCollection.findOne(
            {"_id": o_id}, 
            function(err, minigameObject){
                if(err){
                    response.send(500, "update error");
                }
                else{
                    response.send({
                        "gameData": minigameObject
                    });
                }
        });
    }
    else {
        response.send(500, "update error");
    }
});

// POSTS a game to a user's minigameLibrary list of id's
app.post("/addToUserLib", function(request, response){
    var accountProfiles = ALL_COLLECTIONS_DATA.accountProfiles;
    var userStr = request.body['username'];
    var gameId = request.body['gameid'];
    var query = {'username': userStr};

    if ((userStr !== undefined) || (userStr !== "")) {
        accountProfiles.findOne(query, function(err, userObj){
            if(err) response.send(500, "update error");
            else {
                userObj.minigameLibrary.push(gameId);
                accountProfiles.update(query, userObj, function(err) {
                    if (err) response.send(500, "update error");
                    else {
                        response.send("ok");
                    }
                });
            }
        });
    }
});

// GETS a user's minigameLibrary 
// (AND update their QUESTION_DATA, if applicable)
app.get("/minigameLib/:username", function(request, response) {
    var accountProfiles = ALL_COLLECTIONS_DATA.accountProfiles;
    var userStr = request.params.username;
    var query = {'username': userStr};

    if ((userStr !== undefined) || (userStr !== "")) {
        accountProfiles.findOne(query, function(err, userObj){
            if(err) response.send(500, "update error");
            else {
                if (userObj.contentSet === undefined) {
                    var questionSetName = "english-easy"
                } else {
                    var questionSetName = userObj.contentSet;
                }
                techcafe.getContentSetList(function(data){
                    // update what the question data is for the user
                    if (data[questionSetName] !== undefined &&
                        data[questionSetName].length > 0)
                        QUESTION_DATA = data[questionSetName];
                    // now actually send minigame library like asked for
                    response.send(userObj.minigameLibrary);
                });
            }
        });
    }
    else {
        response.send("temporary user!");
    }
});

// PUTS a user's initial minigameLibrary and tutorials lists
app.put("/initUser/:username", function(request, response) {
    var accountProfiles = ALL_COLLECTIONS_DATA.accountProfiles;
    var userStr = request.params.username;
    // DEFAULT minigame objects!
    var newObj = {
        "username": userStr,
        "tutorials": [],
        "contentSet": "english-easy",
        "minigameLibrary": 
            [
            "51800d7eba85bf4174000008", // cloud mountain
            "5180078fba85bf4174000001", // fire platformer
            "51800bd9ba85bf4174000006", // tap mode
            "51800c81ba85bf4174000007", // atop clouds
            "51800e3aba85bf4174000009", // secret wall
            "518000f86c5caf3c73000005", // block maze
            "51801579ba85bf417400000b", // fire tunnel
            "5180174aba85bf417400000f" // challenge
            ]
    }
    accountProfiles.insert(newObj, function(err) {
        console.log("error: ", err);
        if (err) {
            console.log("insert new user error");
            response.send(400, "write error");
        }
        else {
            ALL_COLLECTIONS_DATA.accountProfiles = accountProfiles;
            response.send({
                "err": err, 
                "msg": "ok"
            });
        }
    });
});

// gets the long id from a short 5 digit id
// a 1 in 100,000 chance that they won't match (pshh)
app.get("/longid/:shortid", function(request, response){
    var shortid = request.params.shortid;
    var longid = "0";
    var minigameCollection = ALL_COLLECTIONS_DATA.minigameData;

    // loop through and see if there's an id with the same first 5 digits
    minigameCollection.find().toArray(function(err, docList){ 
        if (err) console.log(err);
        for (var i = 0; i < docList.length; i++) {
            var doc = docList[i];
            var longidguess = doc._id.toString();
            // shortid is taken from the 5th-9th digits of the mongoid
            if ((longidguess.indexOf(shortid) === 5) &&
               (longid === "0")) {
                longid = longidguess;
            }
        }
        // longid will be 0 if none found or the id found
        response.send({
            "longid": longid
        });
    });
});

// just give them one random question for now
app.get("/info/questions", function(request, response) {
    // question data is an array with beginner questions at index 0
    var questions = QUESTION_DATA;

    var numQuestions = questions.length;
    var randQuestionUnRound = ((numQuestions)*(Math.random()));
    var randQuestionIndex = Math.floor(randQuestionUnRound);
    response.send({
        "question": questions[randQuestionIndex]
    });
});

/** returns a json of all collections in the database; for debug purposes**/
app.get("/info/collections", function(request, response){
    var output = {};
    var loadedCollections = 0;
    
    for(var collectionName in ALL_COLLECTIONS_DATA){
        var collection = ALL_COLLECTIONS_DATA[collectionName];
        // curried so that name isn't wiped out by callback
        (function(name){
            collection.find().toArray(function(err, docList){
                if(err){
                    response.send({
                        error: err
                    });
                }
            
                output[name] = docList;
                loadedCollections++;
                
                if(loadedCollections >= ALL_COLLECTIONS_NAMES.length){
                    response.send({
                        "collections": output
                    });
                }
            });
        })(collectionName);
    }
});

// Changing the Question Content!

app.get("/info/teacherList", function(request, response) {
    techcafe.getTeacherList(function(data) {
        response.send(data); 
    });
});

app.get("/info/contentList/:teacherName", function(request, response) {
    var teacherName = request.params.teacherName;
    techcafe.getContentByTeacher(teacherName, function(data) {
        response.send(data); 
    });
});

// changes question set for current setting
// and for the user for the future!
app.post("/changeQuestionSet", function(request, response) {
    var questionSetName = request.body['qSetName'];
    var accountProfiles = ALL_COLLECTIONS_DATA.accountProfiles;
    techcafe.getContentSetList(function(data){
        // update what the question data is for the user (if it has ?s)
        if (data[questionSetName] !== undefined &&
            data[questionSetName].length > 0)
            QUESTION_DATA = data[questionSetName];
        // now change the user data (if not default user)
        if (request.body['username'] === "default") {
            response.send("ok");
            return;
        }
        var query = {'username': request.body['username']};
        var partialUpdate = { $set: { 'contentSet': questionSetName } };
        accountProfiles.update(query, partialUpdate, { 'multi': true }, 
          function (error){
            if (error)
                throw error;
            else
                response.send("ok");
        });
    });
});

/*
 *
 *      SETUP
 *
 */

function launchApp(pulledContent, collectionData){
    ALL_COLLECTIONS_DATA = collectionData;

    // do another check in case the TECH CAFE database fails
    var backupQcoll = ALL_COLLECTIONS_DATA["questions"];
    backupQcoll.find().toArray(function(err, questArray) {
        // assuming there's only one object
        var backupQuestions = questArray[0];
        if (pulledContent === "use backup questions") {
            pulledContent = backupQuestions;
        }

        // now finally set it all up
        QUESTION_DATA = pulledContent;
        
        assert.assert(QUESTION_DATA !== null, 
            "did not pull content properly");
        assert.assert(ALL_COLLECTIONS_DATA !== null, 
            "did not pull collections properly");
        
        //console.log('pulled content\n', QUESTION_DATA);
        //console.log('loaded collections\n');
        
        var port = process.env.PORT || 8000;
        console.log("starting app on port", port);
        app.listen(port);
    });
}

// takes a function that takes a dictionary of collections
function openDb(onAllLoadedFn){
    var collectionNames = ALL_COLLECTIONS_NAMES;
    var loadedCollections = {};
    var numLoadedCollections = 0;
    
    // creates a function that will be called when a collection is loaded
    function makeCollectionReadyFn(loadedName){
        // curried so that loadedName remains local to function
        return function(err, loadedCollection){
            if (err) throw err;
            
            numLoadedCollections++;
            loadedCollections[loadedName] = loadedCollection;
            //console.log(loadedName, "collection loaded!");
            if(numLoadedCollections >= collectionNames.length){
                onAllLoadedFn(loadedCollections);
            }
        }
    }
    
    // called when the database is opened; opens all collections
    function onDbReady(){
        //console.log('database opened!');
        console.log('loading collections...');
        
        for(var i = 0; i < collectionNames.length; i++){
            var collectionName = collectionNames[i];
            //console.log('loading ', collectionName, '...');
            mongoClient.collection(collectionName, 
                                   makeCollectionReadyFn(collectionName));
        }
    }

    // takes care of the mongolab authentication for the database
    function _databaseAuth(err, db) {
        if (err) done(err);
        //console.log("authenticating mongolab database for auth...")
        db.authenticate(
            username, 
            password, 
            function(error, result) {
                if (error) done(error);
                // result being false means authentication didn't work
                if (!result) {
                    console.log("database authentication not successsful.");
                }
                else {
                    //console.log("db authentication successful!");
                    onDbReady();
                }
            });
    }

    // start the callback chain!
    console.log('opening database...');
    mongoClient.open(_databaseAuth);
}

function closeDb(){
    mongoClient.close();
}

// takes a function that takes a pulled-content dictionary
function pullQuestionContent(onPulledFn){
    console.log('pulling question content from server...');
    var options = {host:'techcafe-teacher.herokuapp.com', 
                   path:easyEnglishQuestionsPath, method:'GET'};
    techcafe.getContentByTeacher('epintar', function(data){
        // Returns a list of JSON objects containing all content 
        // sets owned by teacher 'epintar' (default teacher name)
        //console.log("questions pulled", data.content_sets[0].questions);
        onPulledFn(data.content_sets[0].questions);
    });
    // var	callback = function(response) { 
    //     var str = ''; 
    //     response.on('data', function (chunk){ 
    //         str += chunk; 
    //     });
        
    //     response.on('error' , function(err) {
    //         console.log("TECH CAFE DATABASE BROKEN.\n", err);
    //         onPulledFn("use backup questions");
    //     });

    //     response.on('end', function () { 
    //         var parsedVal = JSON.parse(str);
    //         //console.log('question content pulled!');
    //     });
    // };

    // http.request(options,callback).on('error', function(err){
    //     console.log("error while loading content", err);
    // }).end();


}

/** initServer

**/
function initServer() {
    var _pulledContent = null;
    var _collectionData = null;
    
    var _contentLoaded = false;
    var _collectionsLoaded = false;
    
    function _attemptLaunch(){
        if(_contentLoaded === true && _collectionsLoaded === true){
            launchApp(_pulledContent, _collectionData);
        }
    }

    function _grabContent(){
        //console.log("loaded mongo-express-auth!");
        
        pullQuestionContent(function(pulledData){
            _pulledContent = pulledData;
            _contentLoaded = true;
            _attemptLaunch();
        });
        
        openDb(function(loadedCollectionData){
            _collectionData = loadedCollectionData;
            _collectionsLoaded = true;
            _attemptLaunch();
        });
    }

    function _initUserAuth() {
        console.log("initializing mongo-express-auth...");
        mongoExpressAuth.init({
            mongo: { 
                dbName: DB_NAME,
                collectionName: 'accounts',
                host: 'dbh85.mongolab.com',
                port: 27857,
                dbusername: username,
                dbpassword: password
            }
        }, _grabContent);
    }

    _initUserAuth();
}


/*
    TECH CAFE MODULE
*/

// wrapped techcafe node module in a closure

var techcafe = (function() {
    // this is what is exported
    var module = {};
    // other req's
    var http = require('http');
    var events = new require('events');
    var eventResp = new events.EventEmitter;
    eventResp.setMaxListeners(0);

    var options = {  
        host: 'techcafe-teacher.herokuapp.com', 
        method: 'GET',
    };

    function setListener(event, callback){
        if (str === undefined){
            eventResp.once(event, function(data){
                if (data !== 'null'){ 
                    try{
                        callback(JSON.parse(data));
                    }
                    catch(err){
                        callback("Error here");
                    }
                }
                else{
                    callback("No data found.");
                }
            });
            eventResp.once('error', function(err){
                callback('Error, internal kind: ' + err);
            });
        }
        else{
            callback(str);
        }
    }

    var str; 

    // Returns a list of all teachers in the database
    // Format: [{username:Teacher1}, 
    //          {username:Teacher2},...]
    module.getTeacherList = function(callback){
        var opt = options; 
        opt.path = '/users/teacher_list.json';
        
        http.request(opt,function(response){
            var str = ''; 
            response.on('error', function(err){
                console.log('Error: ' + err);
                eventResp.emit('error', err);
            });
            response.on('data', function (chunk) 
                { str += chunk; }
            );
            response.on('end', function () { 
                eventResp.emit('completeTeacherList', str);
            });
        }).end();

        setListener('completeTeacherList',callback);
    }

    // Returns a list of all content sets in the database
    //Format: {ContentSet1: Questions, ContentSet2: Questions, ...}
    module.getContentSetList = function(callback){
        var opt = options; 
        opt.path = '/content_sets/get_content_sets.json';
        
        http.request(opt,function(response){
            var str = ''; 
            response.on('error', function(err){
                console.log('Error: ' + err);
                eventResp.emit('error', err);
            });
            response.on('data', function (chunk) 
                { str += chunk; }
            );
            response.on('end', function () { 
                eventResp.emit('completeContentSetList', str);
            });
        }).end();

        setListener('completeContentSetList', callback);
    }

    //Returns JSON containing all content sets for given teacher ID
    // Format: {
    //          username: 'username', content_sets: 
    //          [{name:ContentSet1, questions:Questions},
    //          {name:ContentSet2, questions:Questions}, ...]
    //          }
    module.getContentByTeacher = function(tid, callback){
        var opt = options; 
        opt.path = '/users/teacher_content.json?name='+tid+'&include_content_sets=true';
        
        http.request(opt,function(response){
            var str = ''; 
            response.on('error', function(err){
                console.log('INTERNAL Error: ' + err);
                eventResp.emit('inside error', err);
            });
            response.on('data', function (chunk) 
                { str += chunk; }
            );
            response.on('end', function () { 
                eventResp.emit('teacherContent'+tid, str);
            });
        }).end();

        setListener('teacherContent'+tid, callback);    
    }

    return module;
}());


initServer();
