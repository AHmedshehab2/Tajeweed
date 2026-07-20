const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { Readable } = require("stream");

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

const isConfigured = !!(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET_NAME);

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

module.exports = { isConfigured, uploadBuffer, destroy };
