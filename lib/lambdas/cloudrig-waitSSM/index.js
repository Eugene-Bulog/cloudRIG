exports.handler = (event, context, callback) => {

    var commonlib = require("common.js");
    
    var AWS = require("aws-sdk");
    var sns = new AWS.SNS();
    var ec2 = new AWS.EC2();
    var cloudwatchevents = new AWS.CloudWatchEvents();


    var eventBody = JSON.parse(event.Records[0].Sns.Message);
    var lambdaARNQueue = eventBody.lambdaARNQueue;
    var common = new commonlib(eventBody);


    function run() {

        common.report("Waiting for SSM");

        var ssm = new AWS.SSM();

        var waitForSSM = {
            arn: "arn:aws:sns:" +
                eventBody.config.AWSRegion + ":" +
                eventBody.settings.UserID + ":cloudrig-waitSSM",
            args: ""
        }

        ssm.describeInstanceInformation(
            {
                Filters: [
                    {
                        Key: "InstanceIds",
                        Values: [eventBody.state.instance.InstanceId]
                    }
                ]
            },
            function (err, data) {
                if (err) {
                    common.triggerRollback(err);
                    return;
                }

                if (data.InstanceInformationList.length > 0) {
                    common.triggerNextLambda(lambdaARNQueue, eventBody);
                } else {
                    // repeat this lambda in one minute
                    lambdaARNQueue.unshift(waitForSSM);
                    common.scheduleNextLambda("1 minute", lambdaARNQueue, eventBody);
                }
            }
        );
    }

    common.start(run, eventBody);

}