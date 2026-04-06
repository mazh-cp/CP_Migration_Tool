'use strict';

const Joi = require('joi');

const connectionSchema = Joi.alternatives().try(
  Joi.object({
    host: Joi.string().required(),
    vsys: Joi.string().default('vsys1'),
    apiKey: Joi.string().min(1).required(),
    username: Joi.forbidden(),
    password: Joi.forbidden(),
  }),
  Joi.object({
    host: Joi.string().required(),
    vsys: Joi.string().default('vsys1'),
    username: Joi.string().min(1).required(),
    password: Joi.string().min(1).required(),
    apiKey: Joi.forbidden(),
  })
);

const panoramaSchema = Joi.alternatives().try(
  Joi.object({
    host: Joi.string().required(),
    vsys: Joi.string().default('vsys1'),
    apiKey: Joi.string().min(1).required(),
    deviceGroup: Joi.string().allow('', null),
    targetSerial: Joi.string().allow('', null),
    username: Joi.forbidden(),
    password: Joi.forbidden(),
  }),
  Joi.object({
    host: Joi.string().required(),
    vsys: Joi.string().default('vsys1'),
    username: Joi.string().min(1).required(),
    password: Joi.string().min(1).required(),
    deviceGroup: Joi.string().allow('', null),
    targetSerial: Joi.string().allow('', null),
    apiKey: Joi.forbidden(),
  })
);

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

module.exports = { connectionSchema, panoramaSchema, validateBody };
