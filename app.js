'use strict';

const express = require('express');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/import/paloalto', require('./src/routes/paloalto/importRoutes'));

// Existing / additional routes go below.

module.exports = app;
