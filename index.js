/**
 * 
 * Skript för att uppdatera callnumber för holdingsposter
 * via inläsning av mmsid och holdingid från CSV-fil(uttagen via Alma analytics)
 * 
 * Alma uppdateras via API-anrop
 * 
 */

/**
 * Loggning via winston
 */
const winston = require('winston');

const timezoned = () => {
    var options = {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        timeZone: 'Europe/Stockholm'
    };
    return new Date().toLocaleString('sv-SE', options);
};

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: timezoned
          }),
        winston.format.json()
    ),
    defaultMeta: { service: 'user-service' },
    transports: [
      //
      // - Write to all logs with level `info` and below to `combined.log` 
      // - Write all logs error (and below) to `error.log`.
      //
      new winston.transports.File({ filename: 'error.log', level: 'error' }),
      new winston.transports.File({ filename: 'combined.log' })
    ]
  });

// Environment variabler

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

//Använd Axios för api-anropen
const axios = require('axios')

//Använd fs och fast-csv för att läsa filer
const fs = require('fs')
const csv = require('fast-csv');

//Använd xml2js för att hantera XML -> JSON och JSON -> XML
parseString = require("xml2js").parseString;
xml2js = require("xml2js");

//Skapa headers att skicka med anropet till Alma
//Apikey och datatyp
var config = {
    headers: {
        'Authorization': 'apikey ' + process.env.ALMA_APIKEY,
        'Accept': 'application/xml'
    }
};

/**
 * Funktion som hämtar holding från Alma via API
 * @param {*} mms_id 
 * @param {*} holding_id 
 */
const getHolding_alma = async (mms_id, holding_id) => {
    try {
      return await axios.get(process.env.ALMA_API_URL + '/bibs/' + mms_id + '/holdings/' + holding_id + '?apikey=l7xx28ab762a7bd44305b8af710f1454e40b', config)
    } catch (error) {
      //console.error(error)
      logger.log('error', error)
      return "error " + error
    }
}

 /**
  * Funktion som uppdaterar holding i Alma via API
  * @param {*} mms_id 
  * @param {*} holding_id 
  * @param {*} xml 
  */
const updateHolding_alma = async (mms_id, holding_id, xml) => {
  try {
    var postconfig = {
        headers: {
            'Authorization': 'apikey ' + process.env.ALMA_APIKEY,
            'Accept': 'application/xml',
            'Content-Type': 'application/xml',
            'Content-Length': xml.length
        }
    };
    return await axios.put(process.env.ALMA_API_URL + '/bibs/' + mms_id + '/holdings/' + holding_id, xml, postconfig)
  } catch (error) {
        //console.error(error)
        logger.log('error', error)
  }
}

/**
 * Funktion som hanterar Alma-data(hämtar och uppdaterar)
 * @param {*} mms_id 
 * @param {*} holding_id 
 * @param {*} Permanent_Call_Number 
 */
const updateHolding = async (mms_id, holding_id, Permanent_Call_Number) => {
    const holding = await getHolding_alma(mms_id, holding_id)
    if (!holding.data){
        console.log(holding)
        logger.log('error', holding);
    } else {
        var xml
        //console.log(holding.data)
        //Gör om XML till JSON
        parseString(holding.data, function(err, result) {
            if (err) logger.log('error', err);
            //Hitta callnummer-fältet som ligger i 852 -> h
            for(var i = 0; i < result.holding.record[0].datafield[0].subfield.length; i++) {
                if (result.holding.record[0].datafield[0].subfield[i].$.code == 'h') {
                result.holding.record[0].datafield[0].subfield[i]._ = Permanent_Call_Number
                break;
                }
            }
            //Tillbaka till XML igen.
            var builder = new xml2js.Builder();
            xml = builder.buildObject(result);  
        });

        //Uppdatera Alma
        
        const holdingupdated = await updateHolding_alma(mms_id, holding_id, xml)
        if (holdingupdated.data.indexOf("error") !== -1){
            logger.log('error', holdingupdated.data);
        } else {
            logger.log('info', 'Holding ' + holding_id + ',call number updated to: ' + Permanent_Call_Number);
            //console.log('Holding ' + holding_id + ',call number updated to: ' + Permanent_Call_Number)
        }
        
    }
     
}


/**
 * 
 * Läs in CSV-fil
 * 
 * Spara i en array
 * som gås igenom
 * och för varje post 
 * anropar Alma
 * för uppdatering
 * 
 */

holdings = []
fs.createReadStream(process.env.CSV_FILE)
    .pipe(csv.parse({ headers: true, delimiter: ';' }))
    .on('error', error => logger.log('error', err))
    .on('data', row => {
        holdings.push(row) 
    })
    .on('end', rowCount => {
        logger.log('info', 'Start!');
        logger.log('info', `Parsed ${rowCount} rows`);
        console.log(`Parsing ${rowCount} rows`)
        async function processArray(holdings) {
            i = 0
            for (const item of holdings) {
                //console.log(item);
                await updateHolding(item.MMS_Id, item.Holding_Id, item.Permanent_Call_Number)
                //logger.log('info',item.MMS_Id + ' ' + item.Holding_Id + ' ' + item.Permanent_Call_Number)
                i++
                //if (i>2) {
                  //break;
                //}
                console.log( i + " av " + rowCount)
            }
            logger.log('info', 'Done!');
            console.log('Done!');
          }
        processArray(holdings)
    });