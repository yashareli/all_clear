/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onRequest } = require("firebase-functions/v2/https");
const admin = require('firebase-admin');
const moment = require('moment-timezone');
const logger = require("firebase-functions/logger");

const MOMENT_SUNDAY = 0;
const MOMENT_SATURDAY = 6;
const CURRNECY_KEY = 'currency ';

admin.initializeApp();


//validates Mop,VD tuple follows the rules 
//validates both Instructing Agent & instructed Agent are members of this MOP
//validates this MOP supports the specific currency and min, max amounts are kept
exports.CheckInputForClearing = onRequest(async (request, response) => {
  // logger.info("Hello logs!", {structuredData: request.body});
  const body = {};
  const mop = request.body.mop;
  const value_date = request.body.value_date;
  const instructing_agent = request.body.instructing_agent;
  const instructed_agent = request.body.instructed_agent;
  const currency = request.body.currency;
  const amount = request.body.amount;

  //value date validity check
  if (value_date !== undefined) {
    const recieved_value_date = moment(new Date(value_date)).tz("Europe/Berlin");
    const actual_value_date = await getClearingSoonestValueDate(mop);
    body['value_date'] = actual_value_date;

    if (actual_value_date !== null) {
      console.log("Value date input valid:" + (recieved_value_date.dayOfYear() == actual_value_date.dayOfYear()));
      body['value_date_valid'] = (recieved_value_date.dayOfYear() == actual_value_date.dayOfYear());
    } else {
      console.log("ERROR: something went wrong, check logs");
    }
  } else {
    body['value_date'] = "Value Date wasnt injected"
  }
  //validate both agents are members of the MOP
  if (instructing_agent !== undefined && instructed_agent !== undefined) {
    const are_agents_members = await areMopMembers(mop, instructing_agent, instructed_agent);

    if (are_agents_members) {
      console.log("both agents are members of this MOP");
      body['agents_members'] = "both agents are members of this MOP";
    } else {
      console.log("both agents are not members of this MOP");
      body['agents_members'] = "both agents are not members of this MOP";
    }
  } else {
    body['agents_members'] = "Instructing and Instructed Agents werent injected"
  }

  if (currency !== undefined && amount !== undefined) {
    const currency_supported = await isCurrencySupported(mop, currency);
    if (currency_supported) {
      console.log("Currency Is Supported by this MOP");
      body['currency'] = "Currency Is Supported by this MOP";
      const amount_in_range = await amountInRange(mop, amount);
      if (amount_in_range) {
        console.log("Amount Is Supported by this MOP");
        body['amount'] = "Amount Is Supported by this MOP";
      } else {
        console.log("Amount Is NOT Supported by this MOP");
        body['amount'] = "Amount Is NOT Supported by this MOP";
      }
    } else {
      console.log("Currency Is NOT Supported by this MOP");
      body['currency'] = "Currency Is NOT Supported by this MOP";
    }
  }

  response.status(200).send(body);
});

//Provides the soonest business date, input is MOP
exports.ProvideClearngBusinessDate = onRequest(async (request, response) => {
  const body = {};
  const mop = request.body.mop;
  const db = admin.firestore();
  const mopRef = db.doc(`/mops/${mop}/working_time/data`);
  const doc = await mopRef.get();
  if (doc.exists) {
    const business_date = await getBusinessDate(doc.data());
    console.log("Clearing Business Date" + business_date.format());
    body['clearing_business_date'] = business_date.format();
  } else {
    console.log("ERROR: No Such mop document");
    body['clearing_business_date'] = "ERROR: Something Went Wrong"
  }
  response.status(200).send(body);
});

exports.ProvideClearngSoonestVD = onRequest(async (request, response) => {
  const mop = request.body.mop;
  const body = {};
  const value_date = await getClearingSoonestValueDate(mop);
  if (value_date !== null) {
    body['value_date'] = "Soonest Value Date: " + value_date.format();
  } else {
    console.log("ERROR: something went wrong, check logs");
  }
  response.status(200).send(body);
});
exports.ValidAdoptClearing2VD = onRequest(async (request, response) => {
  const mop = request.body.mop;
  const body = {};
  const value_date = await getClearingSoonestValueDate(mop);
  if (value_date !== null) {
    body['value_date'] = "Soonest Value Date: " + value_date.format();
  } else {
    console.log("ERROR: something went wrong, check logs");
  }
  response.status(200).send(body);
});

//checks if the entered currecy is supported by this mop
async function isCurrencySupported(mop, currency) {
  const db = admin.firestore();
  const mopRef = db.doc(`/mops/${mop}`);
  const doc = await mopRef.get();
  if (doc.exists) {
    const mop_currency = doc.data()[CURRNECY_KEY].name;
    if (mop_currency === currency) {
      return true;
    }
  } else {
    console.log("ERROR: No Such mop document");
  }
  return false;
}
//checks if the entered amount is in the range of the min & max amounts of this MOP
async function amountInRange(mop, amount) {
  const db = admin.firestore();
  const mopRef = db.doc(`/mops/${mop}`);
  const doc = await mopRef.get();
  if (doc.exists) {
    const max_amount = doc.data()[CURRNECY_KEY].max_amount;
    const min_amount = doc.data()[CURRNECY_KEY].min_amount;
    return (amount >= min_amount && amount <= max_amount);
  } else {
    console.log("ERROR: No Such mop document");
  }
  return false;
}

//checks if the instructing_agent && instructed_agent are members of this MOP
async function areMopMembers(mop, instructing_agent, instructed_agent) {

  let members_count = 0;
  const db = admin.firestore();
  const mopRef = db.doc(`/mops/${mop}`);
  const doc = await mopRef.get();
  if (doc.exists) {
    const members_arr = doc.data().members;
    members_arr.forEach(member => {
      if (member === instructing_agent || member === instructed_agent) {
        members_count++;
      }
    });
  } else {
    console.log("ERROR: No Such mop document");
    return false;
  }
  return members_count == 2;
}

//returns this MOP Soonest Value date 
async function getClearingSoonestValueDate(mop) {

  const db = admin.firestore();
  const mopRef = db.doc(`/mops/${mop}/working_time/data`);
  const doc = await mopRef.get();
  if (doc.exists) {
    const business_date = getValueDate(doc.data());
    // console.log("Actuall Value Date" + business_date.format());
    return business_date;
  } else {
    console.log("ERROR: No Such mop document");
  }
  return null;
};

//Calculates the value date of a MOP working time
function getValueDate(working_time) {
  const payment_latency = working_time.payment_latency;
  let value_date = getBusinessDate(working_time);
  console.log("Business day before payment latency: " + value_date.format());
  for (let i = 0; i < payment_latency; i++) {
    value_date.add(1, 'days');
    // console.log("adding a day latency", value_date.format());
    value_date = getBusinessDate(working_time, value_date);
  }
  console.log("Actuall Value Date: " + value_date.format());
  return value_date;
}

//gets the "current" business date
function getBusinessDate(working_time, time) {
  let current_time = time;
  if (current_time === undefined) {
    current_time = moment().tz("Europe/Berlin");
  }

  if (false === isCutOffTime(working_time.cut_off, current_time)) {
    current_time.add(1, 'days');
    current_time.set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
    // console.log("adding a day cut off", current_time.format());
  }
  // console.log("After CutOff check:" + current_time.format());
  while (isHoliday(working_time.holidays, current_time) || isWeekend(current_time)) {
    current_time.add(1, 'days');
    // console.log("adding a day weekend holiday", current_time.format());
  }
  return current_time;
}
//validates if we are pass the cut off time
function isCutOffTime(cut_off, current_time) {
  const mop_cut_off = moment(current_time).tz("Europe/Berlin").set({ hour: cut_off.hours, minute: cut_off.minutes, second: 0, millisecond: 0 });
  // console.log("test" + current_time.format() + mop_cut_off.format())
  return current_time < mop_cut_off;
}

//validates if this specidic date is a holiday
function isHoliday(holidays, current_time) {

  let is_holiday = false;
  holidays.forEach(element => {
    const holiday = moment(element.toMillis()).tz("Europe/Berlin");
    if (holiday.dayOfYear() == current_time.dayOfYear()) {
      is_holiday = true;
    }
  });
  // console.log("Is hoiday:" + is_holiday);
  return is_holiday;
}
//validates if this specidic date is a weekend day
function isWeekend(current_time) {
  const weekday = current_time.weekday();
  // console.log("Is weekend: " + (weekday == MOMENT_SATURDAY || weekday == MOMENT_SUNDAY));

  return weekday == MOMENT_SATURDAY || weekday == MOMENT_SUNDAY;
}

// logger.info("Hello logs!", mop + "," + value_date + "," +instructing_agent + "," + instructed_agent + "," +currency + "," +amount);
// response.status(200).send(mop + "," + value_date + "," +instructing_agent + "," + instructed_agent + "," +currency + "," +amount);
// const currencies_coll = `/members`;
// const collRef = db.collection(currencies_coll);
// body['currencies'] = [];
// await collRef.get().then(function (querySnapshot) {
//   querySnapshot.forEach(function (doc) {
//     body['currencies'].push({ [doc.id]: doc.data() });
//   });
//   response.status(200).send(body);
// }).catch(function (error) {
//   console.log("Error getting documents: ", error);
//   response.status(500).send(error);
// });