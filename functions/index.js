/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

exports.helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Eli!");
});

//validates Mop,VD tuple follows the rules 
//validates both Instructing Agent & instructed Agent are members of this MOP
//validates this MOP supports the specific currency and min, max amounts are kept
exports.CheckInputForClearing = onRequest((request, response) => {
    logger.info("CheckInputForClearing logs!", {request.body});

    response.send("Hello from Eli!");
  });