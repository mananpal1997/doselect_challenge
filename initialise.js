var mysql = require('mysql');
const config = require('./db.js');

var connection = mysql.createConnection({
	host: config.host,
	user: config.user,
	password: config.password,
	database: config.database
});

connection.connect();

connect.query("CREATE TABLE tokens(access_key varchar(1000), usage_left int);", function(err, info) {
	if(err)
		console.log("Either table exists, or check the parameters in db.js");
});

connect.close();