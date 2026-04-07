const path = require('path');
const fs = require('fs');
const config = require('../config/env');

const USE_LOCAL = process.env.USE_LOCAL_STORAGE === 'true' && process.env.VERCEL !== '1';
const LOCAL_STORAGE_DIR = process.env.RENDER
  ? '/opt/render/project/src/uploads'
  : path.join(__dirname, '../../uploads');

// Ensure uploads dir exists
if (USE_LOCAL && !fs.existsSync(LOCAL_STORAGE_DIR)) {
  fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
}

async function uploadFile(key, buffer, contentType = 'application/pdf') {
  if (USE_LOCAL) {
    const filePath = path.join(LOCAL_STORAGE_DIR, key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
    return key;
  }

  // S3 path
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const s3Client = require('../config/s3');
  await s3Client.send(new PutObjectCommand({
    Bucket: config.aws.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return key;
}

async function getDownloadUrl(key, expiresIn = 900) {
  if (USE_LOCAL) {
    // Return a local serve URL
    return `/api/files/${encodeURIComponent(key)}`;
  }

  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const s3Client = require('../config/s3');
  const command = new GetObjectCommand({ Bucket: config.aws.bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn });
}

async function deleteFile(key) {
  if (USE_LOCAL) {
    const filePath = path.join(LOCAL_STORAGE_DIR, key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }

  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const s3Client = require('../config/s3');
  await s3Client.send(new DeleteObjectCommand({ Bucket: config.aws.bucket, Key: key }));
}

async function getFileBuffer(key) {
  if (USE_LOCAL) {
    const filePath = path.join(LOCAL_STORAGE_DIR, key);
    return fs.readFileSync(filePath);
  }

  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const s3Client = require('../config/s3');
  const res = await s3Client.send(new GetObjectCommand({ Bucket: config.aws.bucket, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function getScriptPdfKey(scriptId, versionId) {
  return `scripts/${scriptId}/versions/${versionId}/script.pdf`;
}

module.exports = { uploadFile, getDownloadUrl, deleteFile, getFileBuffer, getScriptPdfKey, LOCAL_STORAGE_DIR, USE_LOCAL };
