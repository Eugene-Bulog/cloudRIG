"use strict";

var fs = require('fs');
var async = require('async');
var inquirer = require('inquirer');
var prettyjson = require('prettyjson');
var figlet = require('figlet');
var cowsay = require('cowsay');
var argv = require('yargs').argv;
var cloudrig = require('./lib');
var homedir = require('os').homedir();
var cloudrigDir = homedir + "/.cloudrig/";

if (!fs.existsSync(cloudrigDir)) {
	fs.mkdirSync(cloudrigDir);
}

function getConfigFile() {
	return JSON.parse(userDataFileReader("config.json"));
}

function setConfigFile(config) {
	userDataFileWriter("config.json", JSON.stringify(config));
}

function userDataFileWriter(filename, content) {
	fs.writeFileSync(cloudrigDir + filename, content);
}

function userDataFileReader(filename) {
	return fs.readFileSync(cloudrigDir + filename);
}

function displayState(cb) {

	console.log("State:");

	cloudrig.getState(function(err, state) {
		
		var display = {

			"Instances": {
				"Active": state.AWS.activeInstances.length > 0 ? state.AWS.activeInstances.map(function(f) { return f.PublicDnsName; }) : 0,
				"Pending": state.AWS.pendingInstances.length,
				"Shutting down": state.AWS.shuttingDownInstances.length
			},
			"ZeroTier": state.VPN,
			"Steam": state.Steam,
			"Microsoft Remote Desktop exists": state.RDP
		};
				
		console.log(prettyjson.render(display, null, 4));

		cb();

	});

}

function mainMenu() {

	var choices = ["Get State"];

	cloudrig.getState(function(err, state) {
		
		if(state.AWS.activeInstances.length > 0) {
			choices = choices.concat(["Stop cloudRIG", "Open cloudRIG", "Save changes"]);
		} else {
			choices = choices.concat(["Start cloudRIG", "Setup"]);
		}

		inquirer.prompt([{
			name: "cmd",
			message: "Hello.",
			type: "rawlist",
			choices: choices
		}

		]).then(function(answers) {

			switch(answers.cmd) {

				case "Start cloudRIG":

					var start = cloudrig.start(function() {

						console.log("K done");
						mainMenu();

					});

					console.log(prettyjson.render(start, null, 4));

				break;

				case "Stop cloudRIG":

					cloudrig.stop(function() {
						
						console.log("Stopped");
						mainMenu();

					});

				break;

				case "Setup":

					configMenu(function() {
						setup(mainMenu);
					});

				break;

				case "Open cloudRIG":
					
					cloudrig.openRDP(function() {

						console.log("Opening");
						mainMenu();

					});

				break;

				case "Get State":

					displayState(mainMenu);

				break;

				case "Save changes":

					inquirer.prompt([
					{
						type: "confirm",
						name: "shutdown",
						message: "Stop cloudrig?",
						default: false
					}
					]).then(function(answers) {
						
						if(answers.shutdown) {

							inquirer.prompt([
							{
								type: "confirm",
								name: "del",
								message: "Delete existing image?",
								default: true
							}
							]).then(function(answers) {
								cloudrig.update(true, answers.del, mainMenu);
							});

						} else {

							cloudrig.update(false, false, mainMenu);

						}
						
					});

				break;

			}
			
		});

	});

}

function configMenu(cb) {

	var config = getConfigFile();
	var questions = [];

	Object.keys(config).forEach(function(configKey) {

		questions.push({
			type: "input",
			name: configKey,
			message: configKey,
			default: config[configKey]
		});
	
	});

	inquirer.prompt(questions).then(function(answers) {

		if(Object.keys(answers).filter(function(v) { return !v; }).length > 0) {
			console.log("You have an empty value. Gotta have all dem values mate");
			configMenu(cb);
		} else {

			Object.assign(config, answers);
			setConfigFile(config);

			cb();

		}
	
	});

}

function maintenanceMenu() {

	inquirer.prompt([{
		name: "cmd",
		message: "Maintenance Menu",
		type: "rawlist",
		choices: ["Clean up Instance Profiles", "Create Security Group", "Create Key Pair", "Change Config", "Start cloudRIG"] // TODO: Delete old snapshots
	}

	]).then(function(answers) {

		switch(answers.cmd) {

			case "Clean up Instance Profiles":
				
				cloudrig._Instance._getInstanceProfiles(function(err, data) {
					
					if(data.length > 0) {

						inquirer.prompt([{
							name: "toDelete",
							message: "Select instance profiles to delete",
							type: "checkbox",
							choices: data.map(function(profile) {
								return {
									name: profile.InstanceProfileName
								};
							})

						}]).then(function(answers) {

							async.parallel(answers.toDelete.map(function(answer) {
								return cloudrig._Instance._deleteInstanceProfile.bind(null, answer);
							}), function(err, results) {
								console.log("Done");
								maintenanceMenu();
							});

						});

					} else {

						console.log("No instance profiles");
						maintenanceMenu();

					}

				});
			break;

			case "Create Security Group":
				cloudrig._Instance._createSecurityGroup(maintenanceMenu);
			break;

			case "Create Key Pair":
				cloudrig._Instance._createKeyPair(maintenanceMenu);
			break;

			case "Change Config":
				configMenu(maintenanceMenu);
			break;

			case "Start cloudRIG":
				startCloudrig();
			break;

		}

	});

}

function advancedMenu() {

	inquirer.prompt([{
		name: "cmd",
		message: "Advanced",
		type: "rawlist",
		choices: ["Ad hoc", "VPN Start", "Get Remote VPN Address", "Add Instance address to VPN", "Get Windows Password", "Start cloudRIG"]
	}

	]).then(function(answers) {

		switch(answers.cmd) {
			
			case "Ad hoc":

				console.log("Sending Ad Hoc");

				cloudrig._Instance._sendAdHoc(function(err, d) {
					console.log("Response");
					console.log(d);
					advancedMenu()
				});
			break;

			case "VPN Start":
				cloudrig._VPN.start(cb);
			break;

			case "Get Remote VPN Address":

				cloudrig._Instance.sendMessage(cloudrig._VPN.getRemoteInfoCommand(), function(err, resp) {
					console.log(JSON.parse(resp).address);
					advancedMenu();
				});

			break;

			case "Add Instance address to VPN":

				cloudrig._Instance.sendMessage(cloudrig._VPN.getRemoteInfoCommand(), function(err, resp) {
					console.log(resp);
					var address = JSON.parse(resp).address;
					console.log(address);
					cloudrig._VPN.addCloudrigAddressToVPN(address, function() {
						cloudrig._Instance.sendMessage(cloudrig._VPN.getRemoteJoinCommand(), function(err, resp) {
							console.log("Done");
							advancedMenu();
						});
					});
				});

			break;

			case "Get Windows Password":
	
				cloudrig._Instance.getPassword(function(err, password) {
					console.log("---------------------------------");
					console.log("Password: " + password);
					console.log("---------------------------------");
					advancedMenu();
				});

			break;

			case "Start cloudRIG":
				startCloudrig();
			break;
			
		}

	});

}

function validateRequiredSoftware(cb) {

	console.log("Validating required software");

	cloudrig.validateRequiredSoftware(function(err, software) {
		
		if(err) {
			cb(err);
			return;
		}

		var errors = [];
		
		Object.keys(software).forEach(function(key) {
			if(!software[key]) {
				errors.push(key + " is missing");
			}
		});

		if(errors.length > 0) {
			console.log(prettyjson.render(errors, null, 4));
			cb(true);
		} else {
			cb(null);
		}

	});

}

/* TODO:
function validateRequiredConfig(cb) {

	console.log("Validating required config");

	cloudrig.validateRequiredConfig((err, serviceConfig) => {
		
		if(err) {
			cb(err);
			return;
		}

		var errors = [];
		
		Object.keys(software).forEach((key) => {
			if(!software[key]) {
				errors.push(key + " is missing");
			}
		});

		if(errors.length > 0) {
			console.log(prettyjson.render(errors, null, 4));
			cb(true);
		} else {
			cb(null);
		}

	});

}
*/

function validateAndSetConfig(cb) {
	
	console.log("Validating and setting config");

	var config = getConfigFile();
	var configState = cloudrig.getRequiredConfig();
	var questions = [];

	Object.keys(configState).forEach(function(serviceName) {

		configState[serviceName].forEach(function(serviceConfigKey) {

			if(!config[serviceConfigKey]) {
				questions.push({
					type: "input",
					name: serviceConfigKey,
					message: "Enter " + serviceConfigKey
				});
			}
		});

	});
	
	if(questions.length > 0) {
		
		console.log("You're missing some values in your config. Enter them below:");

		inquirer.prompt(questions).then(function(answers) {

			// TODO: cloudrig.validateRequiredConfig()

			Object.assign(config, answers);
			setConfigFile(config);
			validateAndSetConfig(cb);

		});

	} else {

		console.log("Setting config");
		var displayConfig = Object.assign({}, config);
		displayConfig.ZeroTierAPIKey = "(set)";
		
		console.log(prettyjson.render(displayConfig, null, 4));
		cloudrig.setConfig(config);

		cb(null);

	}

}

function setup(cb) {

	console.log("Setting up");

	cloudrig.setup(userDataFileReader, userDataFileWriter, function(err, serviceSetups) {
		
		if(err) {
			cb(err);
			return;
		}

		var questions = [];

		Object.keys(serviceSetups).forEach(function(serviceSetup) {

			var serviceSetupQuestions = serviceSetups[serviceSetup];

			if(serviceSetupQuestions) {

				serviceSetupQuestions.forEach(function(question) {

					questions.push({
						text: "[" + serviceSetup + "] " + question.q,
						func: question.m
					});

				});

			}

		});

		if(questions.length > 0) {

			console.log("There's some things that need to be set up. I can do them for you.");

			inquirer.prompt(questions.map(function(question, i) {

				return {
					type: "confirm",
					name: "q-" + i,
					message: question.text
				};

			})).then(function(answers) {
				
				var toProcess = [];
				
				Object.keys(answers).forEach(function(answer, i) {

					if(answers[answer]) {
						toProcess.push(questions[i].func);
					}

				});

				if(toProcess.length > 0) {

					async.parallel(toProcess, function(err, val) {

						if(err) {
							cb(err);
							return;
						}

						console.log("OK done. Redoing setup to check it's all good");
						setup(cb);

					});

				}

			});

		} else {

			cb(null);

		}
			
	});

}

function setReporter() {
	cloudrig.setReporter(console);
}

function showIntro() {

	console.log(figlet.textSync('cloudRIG', {
		font: 'Standard',
		horizontalLayout: 'default',
		verticalLayout: 'default'
	}));

	console.log("https://www.cloudrig.io");

	console.log(cowsay.say({
		text : ["u know toilet duck\nor whatever\ni got some on my lip today\ncleaning the toilt\nit burned like fuck\ndon't recommend", "literally slept wiht like a drumstick of tandoori chicken\nand it stained my good sheets, my duvet inner, and my matress protector\nso i don't want to talk about it"][1],
		e : "oO",
		T : "U "
	}));

}

function checkAndSetDefaultConfig() {
	// TODO: Make this safer for already existing config file
	// fs.existsSync
	try {
		getConfigFile();
	} catch(ex) {
		console.log("[!] Config file missing/broken - copying from config.sample.json");
		setConfigFile(JSON.parse(fs.readFileSync(process.cwd() + "/config.sample.json")));
	}
}

function startCloudrig() {
	
	async.series([

		validateRequiredSoftware,
		validateAndSetConfig,
		setup

	], function(err) {

		if(err) {
			console.log(cowsay.say({
				text : `Something catastrophic went wrong bb:\n\n${err}`,
				e : "oO",
				T : "U "
			}));
			return;
		}

		mainMenu();

	});

}

function startMaintenanceMode() {

	console.log("\n------------ [!] MAINTENANCE MODE [!] ------------\n");

	async.series([

		validateRequiredSoftware,
		validateAndSetConfig,
		cloudrig._maintenance

	], function(err) {

		if(err) {
			console.log(cowsay.say({
				text : "Something catastrophic went wrong.",
				e : "oO",
				T : "U "
			}));
			return;
		}

		maintenanceMenu();

	});

}

function startAdvancedMode() {

	console.log("\n------------ [!] ADVANCED MODE [!] ------------\n");

	async.series([

		validateRequiredSoftware,
		validateAndSetConfig,
		setup

	], function(err) {

		advancedMenu();

	});

}

// INIT

showIntro();
checkAndSetDefaultConfig();
setReporter();
(argv.m ? startMaintenanceMode : argv.a ? startAdvancedMode : startCloudrig)();