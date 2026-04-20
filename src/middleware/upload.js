const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const runId = req.params.runId || uuidv4();
    req.runId = runId;
    const uploadDir = path.join(__dirname, '..', '..', 'data', 'runs', runId, 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Original-Dateinamen beibehalten (UTF-8 dekodieren)
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, originalName);
  }
});

const fileFilter = (req, file, cb) => {
  // Erlaubte Dateitypen
  const allowedMimes = [
    'text/plain', 'text/markdown', 'text/csv', 'text/html',
    'application/pdf',
    'application/json',
    'application/zip', 'application/x-zip-compressed',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg', 'image/gif'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Dateityp ${file.mimetype} ist nicht erlaubt.`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

module.exports = upload;
