var express = require('express');
var body_parser = require('body-parser');
var multer = require('multer');
var image_type = require('image-type');
var fs = require('fs');
var uuid = require('uuid/v1');
var cmd = require('node-cmd');
var async = require('async');
var mysql = require('mysql');
var crypt = require('cryptr');
const config = require('./db.js');

var encryptor = new crypt("testing123");

var connection = mysql.createConnection({
	host: config.host,
	user: config.user,
	password: config.password,
	database: config.database
});

connection.connect();

var app = module.exports = express();

app.use(body_parser.urlencoded({extended: true}));
app.use(body_parser.json());
app.use(multer().any());
app.use(express.static('storage'));

var port = 3000;

var router = express.Router();

app.use('/api', router);

var allowed_extensions = ["jpg", "png", "jpeg", "tiff", "bmp", "gif"];

app.listen(port);
console.log('running...');

var update_table = function(access_key) {
	connection.query("UPDATE tokens SET usage_left=usage_left-1 WHERE access_key='" + access_key + "';", function(err, instance) {
		if(err)
			console.log(err);
	});
}

// get new access key (for new users as well as old users)
router.get('/access_key', function(req, res) {
	var access_key = uuid();
	connection.query("INSERT INTO tokens VALUES('" + access_key + "', 100);", function(err, instance) {
		if(err)
			res.status(400).json({"error": "Access key could not be generated. Try again."});
			// console.log(err);
		else {
			cmd.run('mkdir storage/' + encryptor.encrypt(access_key));
			res.json({"access_key": access_key});
		}
	});
});

// regenerate key (only for old users)
router.get('/regenerate_key', function(req, res) {
	// so that data linked to expired key is not lost
	var previous_key = req.body.previous_key;
	console.log(connection.escape(previous_key));
	connection.query("SELECT * FROM tokens WHERE access_key=" + connection.escape(previous_key) + ";", function(err, instances) {
		if(err)
			res.status(400).json({"error": "Some error occurred. Try again."});
		else if(instances.length == 0)
			res.status(400).json({"error": "Access key to be linked not found."});
		else {
			var data = instances[0];
			var new_key = uuid();
			connection.query("UPDATE tokens SET access_key='" + new_key + "', usage_left=100 WHERE access_key='" + previous_key + "';", function(err, instance) {
				if(err)
					res.status(400).json({"error": "Some error occurred while regenerating new key. Try again."});
				else {
					cmd.run('mv storage/' + encryptor.encrypt(previous_key) + " storage/" + encryptor.encrypt(new_key));
					res.json({"access_key": new_key});
				}
			});
		}
	});
});

// uploading multiple images and gifs
router.post('/files', function(req, res) {
	var access_key = req.body.access_key;
	connection.query("SELECT * FROM tokens WHERE access_key=" + connection.escape(access_key) + ";", function(err, instances) {
		if(err)
			res.status(400).json({"error": "Some error occurred. Try again."});
		else if(instances.length == 0)
			res.status(400).json({"error": "Incorrect access key."});
		else {
			var data = instances[0];
			if(data.usage_left == 0)
				res.status(400).json({"error": "Access key usage limit is exceeded. Regenerate a new key."});
			else {
				update_table(access_key);
				var files = req.files;
				var error_files = [];
				async.series([
					function(cb) {
						for(var i=0; i<files.length; i++) {
							var file = files[i];
							if(allowed_extensions.includes(file.originalname.split('.').pop()) == false || image_type(file.buffer) === null)
								error_files.push(file.originalname);
							else if(image_type(file.buffer).ext != "gif")
								fs.writeFile('storage/' + encryptor.encrypt(access_key) + "/" + file.originalname, file.buffer, function(err) {
									if(err)
										throw err;
									else {
										// lossless compression
										// console.log("running compression");
										cmd.run("./lepton/lepton storage/" + encryptor.encrypt(access_key) + "/" + file.originalname + ' storage/' + encryptor.encrypt(access_key) + "/" + file.originalname + ".lep");
										// console.log("deleting...");
										cmd.run("rm -rf storage/" + encryptor.encrypt(access_key) + "/" + file.originalname);
									}
								});
							else {
								fs.writeFile('storage/' + encryptor.encrypt(access_key) + "/" + file.originalname, file.buffer, function(err) {
									if(err)
										throw err;
								});
							}
						}
						cb();
					},
					function(cb) {
						if(error_files.length == files.length)
							res.status(400).json({"error": "No files could be uploaded. Only images allowed."});
						else if(error_files.length)
							res.json({"message": "Following files could not be uploaded: " + error_files});
						else
							res.json({"message": "All files uploaded."});
					}
				]);
			}
		}
	});
});

// get images and gifs
router.get('/files', function(req, res) {
	var access_key = req.body.access_key;
	connection.query("SELECT * FROM tokens WHERE access_key=" + connection.escape(access_key) + ";", function(err, instances) {
		if(err)
			res.status(400).json({"error": "Some error occurred. Try again."});
		else if(instances.length == 0)
			res.status(400).json({"error": "Incorrect access key."});
		else {
			var data = instances[0];
			if(data.usage_left == 0)
				res.status(400).json({"error": "Access key usage limit is exceeded. Regenerate a new key."});
			else {
				update_table(access_key);
				// if single image or gif is requested
				if(req.body.filename) {
					var filename = req.body.filename;
					var dir_name = 'storage/' + encryptor.encrypt(access_key) + '/';
					if(filename.split(".").pop() == "gif") {
						fs.stat(dir_name + filename, function(err, stat) {
							if(err)
								res.status(400).json({"error": "No gif found"});
							else
								res.json({"data": "http://0.0.0.0:3000/" + encryptor.encrypt(access_key) + "/" + filename});
						});
					}
					else {
						filename += ".lep";
						fs.stat(dir_name + filename, function(err, stat) {
							if(err)
								res.status(400).json({"error": "No image found"});
							else
								res.json({"data": "http://0.0.0.0:3000/" + encryptor.encrypt(access_key) + "/" + filename});
						});
					}
				}

				// returning multiple images and gifs
				else {
					var files = [];
					async.series([
						function(cb) {
							var dir_name = 'storage/' + encryptor.encrypt(access_key) + '/';
							fs.readdir(dir_name, function(err, filenames) {
								if(err)
									res.status(400).json({"error": err});
								else {
									filenames.forEach(function(filename) {
										files.push("http://0.0.0.0:3000/" + encryptor.encrypt(access_key) + "/" + filename);
									});
									cb();
								}
							});
						},
						function(cb) {
							res.json({"data": files});
							cb();
						}
					]);
				}
			}
		}
	});
});

// delete a file
router.delete('/files', function(req, res) {
	var filename = req.body.filename;
	var access_key = req.body.access_key;
	connection.query("SELECT * FROM tokens WHERE access_key=" + connection.escape(access_key) + ";", function(err, instances) {
		if(err)
			res.status(400).json({"error": "Some error occurred. Try again."});
		else if(instances.length == 0)
			res.status(400).json({"error": "Incorrect access key."});
		else {
			var data = instances[0];
			if(data.usage_left == 0)
				res.status(400).json({"error": "Access key usage limit is exceeded. Regenerate a new key."});
			else {
				update_table(access_key);
				var dir_name = 'storage/' + encryptor.encrypt(access_key) + '/';
				if(filename.split(".").pop() == "gif")
					fs.stat(dir_name + filename, function(err, stat) {
						if(err)
							res.status(400).json({"error": "File not found"});
						else {
							cmd.run("rm -rf storage/" + encryptor.encrypt(access_key) + "/" + filename);
							res.json({"message": "File has been deleted"});
						}
					});
				else
					fs.stat(dir_name + filename + ".lep", function(err, stat) {
						if(err)
							res.status(400).json({"error": "File not found"});
						else {
							cmd.run("rm -rf storage/" + encryptor.encrypt(access_key) + "/" + filename + ".lep");
							res.json({"message": "File has been deleted"});
						}
					});
			}
		}
	});
});

// patch a file
router.patch('/files', function(req, res) {
	var filename = req.body.filename;
	var access_key = req.body.access_key;
	connection.query("SELECT * FROM tokens WHERE access_key=" + connection.escape(access_key) + ";", function(err, instances) {
		if(err)
			res.status(400).json({"error": "Some error occurred. Try again."});
		else if(instances.length == 0)
			res.status(400).json({"error": "Incorrect access key."});
		else {
			var data = instances[0];
			if(data.usage_left == 0)
				res.status(400).json({"error": "Access key usage limit is exceeded. Regenerate a new key."});
			else {
				update_table(access_key);
				var file = req.files[0];
				if((image_type(file.buffer) == "gif" && filename.split(".").pop() != "gif") || (image_type(file.buffer) != "gif" && filename.split(".").pop() == "gif"))
					res.status(400).json({"error": "Filetype updation error"});
				else if(allowed_extensions.includes(file.originalname.split('.').pop()) == false || image_type(file.buffer) === null)
					res.status(400).json({"error": "Filetype not supported."});
				else if(filename.split(".").pop() == "gif")
					fs.writeFile('storage/' + encryptor.encrypt(access_key) + "/" + filename, file.buffer, function(err) {
						if(err)
							res.status(400).json({"error": err});
						else
							res.json({"message": "Gif has been updated."});
					});
				else
					fs.writeFile('storage/' + encryptor.encrypt(access_key) + "/" + filename, file.buffer, function(err) {
						if(err)
							res.status(400).json({"error": err});
						else {
							cmd.run("rm -rf storage/" + encryptor.encrypt(access_key) + "/" + filename + ".lep");
							// lossless compression
							// console.log("running compression");
							cmd.run("./lepton/lepton storage/" + encryptor.encrypt(access_key) + "/" + filename + ' storage/' + encryptor.encrypt(access_key) + "/" + filename + ".lep");
							// console.log("deleting...");
							cmd.run("rm -rf storage/" + encryptor.encrypt(access_key) + "/" + filename);
							res.json({"message": "Image has been updated."});
						}
					});
			}
		}
	});
});
