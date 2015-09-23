var express = require('express');
var http = require('http');
var path = require('path');
var bodyParser = require('body-parser');
var request = require('request');
var encoded = 'ENCODED';

var nexmo = require('easynexmo');
var NEXMOKEY = 'KEY';
var NEXMOSECRET = 'SECRET';
var API_PROTOCOL = 'http';
var NEXMONUMBER = 'NUMBER';
var DEBUG = true;
nexmo.initialize(NEXMOKEY,NEXMOSECRET,API_PROTOCOL,DEBUG);

// Send emails
var nodemailer = require('nodemailer');
var fromaddress = 'EmailAddress';
var transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: fromaddress,
		pass: 'password'
	}
});

var app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Returns base64 encoded 'username:password'
app.post('/base64', function(req, res){
	var encoded = base64(req.body.username, req.body.password);
	res.end(JSON.stringify({encoded : encoded}));
});

app.get('/test', function(req, res){
	var url = 'https://outlook.office365.com/api/v1.0/me/events/';
	var options = {
		url: url,
		headers: {'Authorization': encoded}
	};

	request.get(options, 
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var obj = JSON.parse(body);
				console.log('subject', obj.value[0].Subject);
				console.log('subject', obj.value[0].BodyPreview);
				res.end();
			}else{
				console.log("error", error);
				console.log('statusCode', response.statusCode);
				res.end();
			}
		});
});

app.get('/forward', function(req, res){
	var url = 'https://outlook.office365.com/api/v1.0/me/events/';
	var options = {
		url: url,
		headers: {'Authorization': encoded}
	};
	//console.log('reqqq', req);
	request.get(options, 
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
				var obj = JSON.parse(body);
				var dates = [];
				for(var i=0; i<obj.value.length; i++){
					dates.push({
						time: Date.parse(obj.value[i].End),
						displayName: obj.value[i].Location.DisplayName
					});
				}

                                // sort
				dates.sort(function(a,b) { return parseInt(a.time) - parseInt(b.time);} );
				var i=0;
				var isnumber = 0;
				var gotit = 0;
                                console.log("LENGTH: " + obj.value.length);

                                for(i=0;i < obj.value.length; i++) {
                                	console.log("DISP: " + dates[i].displayName + " " + dates[i].time, '\n');
                                }

				for(i=0; i<obj.value.length; i++){
					console.log("i: " + i); 
					console.log('Current date is ', new Date().getTime());
					console.log('Calendar date is ', dates[i].time);
					console.log('DisplayName', dates[i].displayName, '\n/////');
					if(dates[i].displayName){
						console.log("YO: " + dates[i].displayName);
						if(new Date().getTime() < dates[i].time){
							gotit = 1;
							var reg = /(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]‌​)\s*)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)([2-9]1[02-9]‌​|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})/;
							var wordsArr = dates[i].displayName.split(" ");
							isnumber = 0;
							for(var j=0; j<wordsArr.length; j++){
								if(reg.test(wordsArr[j])){
									isnumber = 1;
									break;
								}
							}
						}
					}
					if(isnumber == 1 || gotit == 1) break;
				}

				//Send sms
				if(isnumber == 0){
					console.log("HERE");
					var message = dates[i].displayName;
					var recipient = req.query.nexmo_caller_id;
					var sender = NEXMONUMBER;
					console.log('recipient', recipient);
					if(recipient){
						request.post({url:'https://rest.nexmo.com/sms/json', 
							form: {api_key: NEXMOKEY, api_secret: NEXMOSECRET, to:recipient, from:NEXMONUMBER, text: message}}, 
							function(err,httpResponse,body){ 
								console.log('err', err);
								console.log('bod', body);
								res.end();
								//return;
							});
					} else {
						res.end();
						//return;
					}
				} else {
					console.log("THERE: " + dates[i].displayName);
					
					console.log('Forwarding phone call to... ', dates[i].displayName);
					res.header('Content-Type', 'text/xml').send('<?xml version="1.0" encoding="UTF-8"?> <vxml version = "2.1"> <form> <transfer name="result" dest="tel:+1' + dates[i].displayName + '" bridge="true"> <prompt>Please wait while we transfer you.</prompt> <grammar xml:lang="en-US" root = "TOPLEVEL" mode="voice"> <rule id="TOPLEVEL" scope="public"> <one-of> <item> disconnect </item> </one-of> </rule> </grammar></transfer> </form> </vxml>');
					console.log("DID it get here");
				}
			}else{
				console.log("error", error);
				console.log('statusCode', response.statusCode);
				res.end();
			}
		});
});

app.get('/sendemails', function(req, res){
	var url = 'https://outlook.office365.com/api/v1.0/me/events/';
	var options = {
		url: url,
		headers: {'Authorization': encoded}
	};
	request.get(options, 
		function (error, response, body) {
			console.log('Sending', req.query.text);
			if (!error && response.statusCode == 200) {
				var obj = JSON.parse(body);
				obj.value[0].Attendees.forEach(function(element){
					console.log('Forwarding message to email... ', element.EmailAddress.Address);
					transporter.sendMail({
						from: fromaddress,
						to: element.EmailAddress.Address,
						subject: obj.value[0].Subject,
						text: req.query.text
					});
				});
				res.end();
			}else{
				console.log("error", error);
				console.log('statusCode', response.statusCode);
				res.end();
			}
		});
});


function base64(username, password){
	var text = username + ":" + password;
	var encoded = new Buffer(text).toString('base64');
	return encoded;
}

function filterMessages(arr){
	var reg = /^\$[0-9]+(\.[0-9][0-9])?$/;
	function filterFunction(x){
		return r.test(x);
	}
	var results = [];
	arr.forEach(function(element){
		var wordsArr = element.split(' ');
		var newarr = wordsArr.filter(filterFunction)
		results = results.concat(newarr);
	});
	return results;
}

app.set('port', process.env.PORT || 3000);
http.createServer(app).listen(app.get('port'), function(){

	console.log('Express server listening on port ' + app.get('port'));
});
