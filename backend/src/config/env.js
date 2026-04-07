const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load .env file if it exists (not present on Render/Vercel — env vars injected directly)
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true });
}

module.exports = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/script-distribution',
  nodeEnv: process.env.NODE_ENV || 'development',

  encryption: {
    key: process.env.ENCRYPTION_KEY || '',
    iv: process.env.IV_KEY || '',
    salt: process.env.IV_ENCRYPTION_SALT || '',
  },

  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.AWS_S3_ENDPOINT,
    bucket: process.env.AWS_S3_BUCKET || 'script-distribution-pdfs',
    region: process.env.AWS_S3_REGION || 'us-east-1',
  },

  ai: {
    provider: process.env.AI_PROVIDER || 'claude',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3',
  },
};
