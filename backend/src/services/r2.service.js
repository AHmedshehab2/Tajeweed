const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { Readable } = require("stream");

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

const REQUIRED_R2_FIELDS = [
  ['R2_ACCOUNT_ID', ACCOUNT_ID],
  ['R2_ACCESS_KEY_ID', ACCESS_KEY_ID],
  ['R2_SECRET_ACCESS_KEY', SECRET_ACCESS_KEY],
  ['R2_BUCKET_NAME', BUCKET_NAME],
  ['R2_PUBLIC_URL', PUBLIC_URL],
];
const isConfigured = REQUIRED_R2_FIELDS.every(([, value]) => Boolean(value));

function getStorageConfigurationError({ required = false } = {}) {
  const configuredCount = REQUIRED_R2_FIELDS.filter(([, value]) => Boolean(value)).length;
  if (required && !isConfigured) {
    return 'Durable R2 storage is required but not configured';
  }
  if (configuredCount > 0 && !isConfigured) {
    const missing = REQUIRED_R2_FIELDS
      .filter(([, value]) => !value)
      .map(([name]) => name)
      .join(', ');
    return `R2 storage configuration is incomplete; missing: ${missing}`;
  }
  return null;
}

const client = isConfigured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
    })
  : null;

async function uploadBuffer(buffer, options = {}) {
  const folder = options.folder || "uploads";
  const publicId = options.public_id || `${Date.now()}`;
  const key = `${folder}/${publicId}`;

  const stream = Readable.from(buffer);

  const upload = new Upload({
    client,
    params: {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: stream,
    },
    queueSize: 4,
    partSize: 10 * 1024 * 1024,
    leavePartsOnError: false,
  });

  await upload.done();

  return { secure_url: `${PUBLIC_URL}/${key}`, public_id: key, cloudinaryId: key };
}

async function destroy(key) {
  if (!key) return;
  await client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );
}

module.exports = { isConfigured, getStorageConfigurationError, uploadBuffer, destroy };
