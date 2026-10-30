// TEMPORARY — add Cloudinary moderation add-on before public launch. See TRD Section 7.3.

require("dotenv").config();
const cloudinary = require("cloudinary").v2;

function getCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return cloudinary;
}

// Initial config
getCloudinary();

/**
 * Upload an image buffer stream to Cloudinary.
 * @param {Buffer} buffer - File buffer from multer memoryStorage
 * @param {Object} [options] - Additional Cloudinary upload options
 * @returns {Promise<Object>} Cloudinary upload result object
 */
function uploadImageStream(buffer, options = {}) {
  // Ensure config is fresh
  const client = getCloudinary();

  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: "connectlocal/profile-photos",
      resource_type: "image",
      ...options,
    };

    const stream = client.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

module.exports = {
  cloudinary,
  getCloudinary,
  uploadImageStream,
};
