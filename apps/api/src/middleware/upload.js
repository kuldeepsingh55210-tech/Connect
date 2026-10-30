const multer = require("multer");

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per TRD non-functional requirement

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!file.mimetype || !file.mimetype.startsWith("image/")) {
    const error = new Error("Only image files are allowed.");
    error.code = "INVALID_FILE_TYPE";
    return cb(error, false);
  }
  cb(null, true);
}

const multerUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter,
});

/**
 * Middleware wrapper for single photo upload ('photo' field)
 * Returns clean 400 error for non-image files, >5MB files, or missing file.
 */
function handlePhotoUpload(req, res, next) {
  multerUpload.single("photo")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "File size exceeds 5MB limit.",
        });
      }
      if (err.code === "INVALID_FILE_TYPE") {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "Only image files are allowed.",
        });
      }
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: err.message || "Invalid file upload.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "No image file provided. Please attach a file under the 'photo' field.",
      });
    }

    next();
  });
}

module.exports = {
  handlePhotoUpload,
  MAX_FILE_SIZE,
};
