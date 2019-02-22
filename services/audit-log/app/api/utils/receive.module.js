/* eslint consistent-return: "off" */
// listen and receive events

const amqp = require('amqplib/callback_api');
const Ajv = require('ajv');

const config = require('../../config/index');
const log = require('../../config/logger');

const storage = require('../controllers/' + config.storage); // eslint-disable-line
const schema = require('../../models/log.json');
const payloadSchema = require('../../models/payload.json');

const ajv = new Ajv();
ajv.addSchema(payloadSchema);
const validator = ajv.compile(schema);

// Set url for amqp
const amqpUrl = config.amqpUrl; // eslint-disable-line

const exchange = config.exchangeName;
const listeners = [config.exchangeTopic]; // define all events we listen to or simply #

let Connection = null;
let Channel = null;


const makeQueues = function () { // eslint-disable-line
  try {
    Channel .assertQueue(`${config.exchangeName}`, { }, (err, q) => { // eslint-disable-line
      if (err) {
        log.error(`Queue error: ${err}`);
        return false;
      }
      log.info('[*] Waiting for events.');


      listeners.forEach((ev) => {
        Channel.bindQueue(q.queue, exchange, ev);
      });

      Channel.consume(q.queue, async (msg) => {
        log.info(" [x] Received: %s:'%s'", msg.fields.routingKey, msg.content.toString());

        // @todo: check if mongo connection is ok before acking and if not Ch.nack(msg);
        Channel.ack(msg);

        let message;
        try {
          message = JSON.parse(msg.content.toString());
        } catch (e) {
          log.error('Received message that is not valid JSON');
          log.error(e);
          return false;
        }

        const valid = validator(message);

        if (!valid) {
          if (process.env.NODE_ENV !== 'test') {
            log.error('Message format is not valid!');
            log.error(ajv.errors);
          }
          return false;
        }

        try {
          log.info('Saving event to DB...');
          await storage.addEvent(message);
          log.info('Successfully Saved');
        } catch (error) {
          log.error('Save failed:');
          log.error(error);
        }
      }, { noAck: false });
    });
  } catch (err) {
    log.debug(err);
  }
};

const makeExchange = function () { // eslint-disable-line
  try {
    Channel.assertExchange(exchange, 'topic', { durable: false });
  } catch (err) {
    log.debug(err);
  }
  makeQueues();
};

const makeChannel = function () { // eslint-disable-line
  try {
    Connection.createChannel((err, ch) => {
      Channel = ch;
      makeExchange();
    });
  } catch (err) {
    log.debug(err);
  }
};

const connect = function () {  // eslint-disable-line
  try {
    amqp.connect(amqpUrl, (err, con) => { // eslint-disable-line
      if (err) {
        log.error('Can\'t connect RabbitMQ-Server not running?');
        log.error(err);
        global.queueHealth = false;
        return setTimeout(connect, 1000); // restart
      }

      con.on('close', () => {
        log.error('Connection closed. Reconnecting...');
        global.queueHealth = false;
        return setTimeout(connect, 1000); // restart
      });

      con.on('error', (error) => {
        if (error.message !== 'Connection closing') {
          global.queueHealth = false;
          log.error('Connection error', error.message);
        }
      });
      Connection = con;
      makeChannel();
      global.queueHealth = true;
    });
  } catch (err) {
    log.debug(err);
  }
};


module.exports = { connect };
