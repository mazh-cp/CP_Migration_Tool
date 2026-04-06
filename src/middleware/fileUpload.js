'use strict';

const multer = require('multer');

const storage = multer.memoryStorage();

const maxMb = parseInt(process.env.IMPORT_MAX_FILE_SIZE_MB || '50', 10) || 50;

const fileFilter = (_req, file, cb) => {
  const name = (file.originalname || '').toLowerCase();
  const okExt = name.endsWith('.xml');
  const mime = (file.mimetype || '').toLowerCase();
  const okMime =
    mime === 'application/xml' ||
    mime === 'text/xml' ||
    mime === 'application/xhtml+xml' ||
    mime === '';

  if (name.endsWith('.tgz') || name.endsWith('.tar.gz') || name.endsWith('.gz')) {
    return cb(
      new Error(
        'TGZ / device state archives are not accepted. Export PAN-OS XML via Device > Setup > Operations > Export named configuration snapshot.'
      ),
      false
    );
  }

  if (okExt && okMime) return cb(null, true);

  return cb(
    new Error(
      'Only PAN-OS XML config files accepted. Export via Device > Setup > Operations > Export named configuration snapshot.'
    ),
    false
  );
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxMb * 1024 * 1024 },
});

const uploadSingle = upload.single('configFile');

function handleUploadError(err, _req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError || err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }
  return res.status(400).json({ error: err.message });
}

module.exports = { uploadSingle, handleUploadError };
