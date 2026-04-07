const crypto = require('crypto');
const config = require('../config/env');

const ALGORITHM = 'aes-256-cbc';

function getKeyAndIv() {
  const keyStr = config.encryption.key;
  const ivStr = config.encryption.iv;
  const key = Buffer.from(keyStr.slice(-32), 'utf8');
  const iv = Buffer.from(ivStr.slice(0, 16), 'utf8');
  return { key, iv };
}

function hexToBuffer(hexString) {
  return Buffer.from(hexString, 'hex');
}

function decrypt(hexCipherText) {
  const { key, iv } = getKeyAndIv();
  const encrypted = hexToBuffer(hexCipherText);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAutoPadding(false);
  let decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  // Remove PKCS5 padding
  const padLen = decrypted[decrypted.length - 1];
  if (padLen > 0 && padLen <= 16) {
    decrypted = decrypted.slice(0, decrypted.length - padLen);
  }
  return decrypted.toString('utf8');
}

function encrypt(plainText) {
  const { key, iv } = getKeyAndIv();
  // PKCS5 padding
  const blockSize = 16;
  const padLen = blockSize - (Buffer.byteLength(plainText, 'utf8') % blockSize);
  const padded = Buffer.concat([
    Buffer.from(plainText, 'utf8'),
    Buffer.alloc(padLen, padLen),
  ]);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return encrypted.toString('hex');
}

function generateBodyHash(body, moduleDataHeader) {
  const salt = config.encryption.salt;
  const bodyStr = body && typeof body === 'object' ? JSON.stringify(body) : (body || '');
  const combined = bodyStr + moduleDataHeader + salt;
  return crypto.createHash('sha256').update(combined, 'utf8').digest('hex');
}

module.exports = { encrypt, decrypt, generateBodyHash };
