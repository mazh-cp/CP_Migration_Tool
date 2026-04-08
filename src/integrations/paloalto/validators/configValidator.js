'use strict';

const Joi = require('joi');

const vsysName = Joi.string().max(64).pattern(/^[a-zA-Z0-9._-]+$/).default('vsys1');

/** Hostname or IPv4/IPv6 literal (PAN devices). */
const panHost = Joi.string().min(1).max(253).required();

const connectionSchema = Joi.alternatives().try(
  Joi.object({
    host: panHost,
    vsys: vsysName,
    apiKey: Joi.string().min(1).max(8192).required(),
    username: Joi.forbidden(),
    password: Joi.forbidden(),
  }),
  Joi.object({
    host: panHost,
    vsys: vsysName,
    username: Joi.string().min(1).max(256).required(),
    password: Joi.string().min(1).max(256).required(),
    apiKey: Joi.forbidden(),
  })
);

const panoramaSchema = Joi.alternatives().try(
  Joi.object({
    host: panHost,
    vsys: vsysName,
    apiKey: Joi.string().min(1).max(8192).required(),
    deviceGroup: Joi.string().max(256).allow('', null),
    targetSerial: Joi.string().max(128).allow('', null),
    username: Joi.forbidden(),
    password: Joi.forbidden(),
  }),
  Joi.object({
    host: panHost,
    vsys: vsysName,
    username: Joi.string().min(1).max(256).required(),
    password: Joi.string().min(1).max(256).required(),
    deviceGroup: Joi.string().max(256).allow('', null),
    targetSerial: Joi.string().max(128).allow('', null),
    apiKey: Joi.forbidden(),
  })
);

const downloadR8xSchema = Joi.object({
  r8x: Joi.object().unknown(true).required(),
});

function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      const details = error.details.map((d) => d.message);
      return res.status(400).json({ error: 'Validation failed', details });
    }
    req.body = value;
    return next();
  };
}

module.exports = { connectionSchema, panoramaSchema, downloadR8xSchema, validateBody };
