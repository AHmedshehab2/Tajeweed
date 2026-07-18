const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

const isConfigured = !!(CLOUD_NAME && API_KEY && API_SECRET);

if (isConfigured) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
  });
}

function uploadBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'auto', ...options },
      (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result);
      },
    );

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      uploadStream.destroy();
      reject(new Error("Cloudinary upload timed out after 20s"));
    }, 20000);

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

function destroy(publicId) {
  return cloudinary.uploader.destroy(publicId);
}

module.exports = { isConfigured, uploadBuffer, destroy };
