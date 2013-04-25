var express = require("express");
var wwwDir = "/";
var mongoose = require('mongoose');
var teacherportal = require("./node_modules/node_techcafe/node_techcafe");
var mongoUri = process.env.MONGOLAB_URI || 
  'mongodb://localhost:27017'; 
var port = process.env.PORT || 8080;

var app = express.createServer();
var Student = require('./models/Student.js');
var Score = require('./models/Score.js');


function isEmpty(obj){
	for(var i in obj){
		if(obj.hasOwnProperty(i)){
			return false;
		}
	}
	return true;
}

function init(){
    configureExpress(app);

	mongoose.connect(mongoUri);

	app.listen(port);
}

init();

function configureExpress(app){
	app.configure(function(){
		app.use(express.bodyParser());
		app.use(express.methodOverride());
		app.use(express.favicon());
		app.use(express.errorHandler({ showStack: true, dumpExceptions: true }));
		app.use("/", express.static(__dirname + wwwDir));
		app.get("/", function(req, res) { res.render(wwwDir + "/index.html");});
	});
};

app.post('/loginAdmin', function(req,res){
	var username = req.body.username;
	var password = req.body.password;
	if (!(username == 'admin' && password == 'tbwadmin')) {
		res.send('Invalid credentials');
	} 
	else{
		var data = ["Student Accounts:"];
			Student.find(function(err,responseText){
				if (err) console.log(err);
				data.push(responseText);
				res.send(data);
			});
	}
});

app.get("/getTeachers", function(req, res) {
	teacherportal.getTeacherList(function(data){
		res.send(data);
	});	
});

app.post("/getContent", function(req, res) {
	teacherportal.getContentByTeacher(req.body.tid, function(data){
		res.send(data);
	});	
});

app.post("/postGameData", function(req, res){
	var currStudent = new Student({
	gameLength : req.body.gameLength,
	name : req.body.name,
    numCoinsEaten: req.body.numCoinsEaten,
    numCoinsSpawned: req.body.numCoinsSpawned,
    numObstaclesEaten: req.body.numObstaclesEaten,
    numObstaclesSpawned: req.body.numObstaclesSpawned,
    numRightQuestions: req.body.numRightQuestions,
    numTimeoutQuestions: req.body.numTimeoutQuestions,
    numTotalQuestions: req.body.numTotalQuestions,
    numBoostPowersEaten: req.body.numBoostPowersEaten,
    numBoostPowersSpawned: req.body.numBoostPowersSpawned,
    numCrossoutPowersEaten: req.body.numCrossoutPowersEaten,
    numCrossoutPowersSpawned: req.body.numCrossoutPowersSpawned,
    numGasPowersEaten: req.body.numGasPowersEaten,
    numGasPowersSpawned: req.body.numPowersSpawned, 
    numPowersEaten: req.body.numPowersEaten,
    numPowersMissedInitially: req.body.numPowersMissedInitially,
    numPowersSpawned: req.body.numPowersSpawned,
    numTimePowersEaten: req.body.numTimePowersEaten,
    numTimePowersSpawned: req.body.numTimePowersSpawned,
    score: req.body.score,
    timestamp: req.body.timestamp,
    questionData: req.body.questionData,
	}); 

	currStudent.save(function(err){
		 if (err) {
	        return res.send({'err': err});
	    }
	    return res.send('success');
	});
});

app.post("/postScore", function(req, res){
	var newScore = new Score({
		name:req.body.name,
		score:req.body.score
	}); 

	newScore.save(function(err){
		 if (err) {
	        return res.send({'err': err});
	    }
	    return res.send('success');
	});
});

app.get("/getScores", function(req, res){
	
	var scoreData = [];

	Score.find(function(err,responseText){
		if (err) console.log(err);
		
		for (var i = 0; i<responseText.length; i++){
			var tempObj = {}; 
			tempObj.name = responseText[i].name;
			tempObj.score = responseText[i].score;
			scoreData.push(tempObj);
		}

		var topTen = []; 

		function compare(a,b) {
		  if (a.score < b.score)
		     return 1;
		  if (a.score > b.score)
		    return -1;
		  return 0;
		}

		scoreData.sort(compare);

		if (scoreData.length >= 10){
			topTen = scoreData.slice(0,10);
		}
		else{
			topTen = scoreData; 
		}

		res.send(topTen);

	});	

});
