const { S3Client } = require('@aws-sdk/client-s3');
const config = require('./env');

const s3Client = new S3Client({
  region: config.aws.region,
  endpoint: config.aws.endpoint,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
  forcePathStyle: true,
});

module.exports = s3Client;
