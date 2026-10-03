// src/config/mongodb.js
// MongoDB connection using Mongoose

'use strict';

const dns = require('dns');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

let isConnected = false;

// Some networks refuse the SRV lookups that mongodb+srv:// URIs need. DNS_SERVERS (e.g. 8.8.8.8,1.1.1.1) is a
// FALLBACK: the normal system DNS is tried first, and these servers are used only if that lookup fails.
const fallbackDns = () => (process.env.DNS_SERVERS || '').split(',').map((x) => x.trim()).filter(Boolean);

const isDnsFailure = (err) => /querySrv|ENOTFOUND|ETIMEOUT|ECONNREFUSED/i.test(String(err && err.message));

/**
 * Connect to MongoDB using Mongoose
 * Uses async/await pattern
 */
async function connectMongoDB() {
  if (isConnected) {
    logger.info('MongoDB already connected');
    return;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/echosign';

  const connect = () => mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000 });

  try {
    try {
      await connect();
    } catch (err) {
      const servers = fallbackDns();
      if (!servers.length || !isDnsFailure(err)) throw err;
      logger.warn(`MongoDB lookup failed (${err.message}); retrying with DNS servers ${servers.join(', ')}`);
      dns.setServers(servers);
      await connect();
    }

    isConnected = true;

    // Mongoose connection event listeners
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting reconnect...');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
      isConnected = true;
    });

  } catch (error) {
    logger.error('MongoDB connection failed:', error.message);
    throw error;
  }
}

async function disconnectMongoDB() {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected');
  }
}

module.exports = { connectMongoDB, disconnectMongoDB, mongoose };
