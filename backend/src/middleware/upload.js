const multer = require('multer');

const storage = multer.memoryStorage();

const pdfUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
});

// Script versions accept PDF *or* Final Draft (.fdx). The .fdx mimetype is
// unreliable across browsers (octet-stream / xml / empty), so we accept by
// extension as well.
const scriptUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (file.mimetype === 'application/pdf' || name.endsWith('.fdx')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF or Final Draft (.fdx) files are allowed'), false);
    }
  },
});

module.exports = { pdfUpload, scriptUpload };
