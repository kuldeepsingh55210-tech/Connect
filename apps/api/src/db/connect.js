const mongoose = require("mongoose");

/**
 * Connects to MongoDB (Atlas) using MONGODB_URI from environment.
 * Call this once at server startup before mounting routes.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in environment variables.");
  }
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log("MongoDB connected");
  mongoose.connection.on("error", (err) => {
    console.error("[db] MongoDB connection error:", err);
  });
  return mongoose.connection;
}

module.exports = { connectDB };
