'use strict';

const express = require('express');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.disable('x-powered-by');

const { requirePaloAltoExpressApiKey } = require('./src/middleware/paloAltoExpressAuth');
app.use('/api/import/paloalto', requirePaloAltoExpressApiKey, require('./src/routes/paloalto/importRoutes'));

// Existing / additional routes go below.

module.exports = app;
