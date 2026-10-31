const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const { getJwtSecret, getAdminKey } = require("./config/secrets");
const { connectDB } = require("./db/connect");
const authRouter = require("./modules/auth");
const profileRouter = require("./modules/profile");
const discoverRouter = require("./modules/discover");
const connectionsRouter = require("./modules/connections");
const { chatRouter, initChatSocket } = require("./modules/chat");
const { reportsRouter, adminRouter } = require("./modules/trust-safety");
const notificationsRouter = require("./modules/notifications");

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";

app.use(cors());
app.use(express.json());

// Create shared HTTP server for Express and Socket.io
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH"],
  },
});

// Store io reference on app and initialize chat socket logic
app.set("io", io);
initChatSocket(io);

// Basic health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    app: "ConnectLocal API",
    timestamp: new Date().toISOString(),
  });
});

// Database health check endpoint
app.get("/api/health/db", async (req, res) => {
  try {
    const isConnected = mongoose.connection.readyState === 1;
    if (!isConnected) {
      return res.status(503).json({
        status: "error",
        db: "disconnected",
      });
    }

    await mongoose.connection.db.admin().ping();
    return res.status(200).json({
      status: "ok",
      db: "connected",
    });
  } catch (err) {
    return res.status(503).json({
      error: "INTERNAL_SERVER_ERROR",
      db: "disconnected",
      message: err.message,
    });
  }
});

// Dev Auth routes
app.use("/api/auth", authRouter);

// Profile routes (TRD Section 6.1)
app.use("/api/users", profileRouter);

// Discover routes (TRD Section 5)
app.use("/api/discover", discoverRouter);

// Connections routes (TRD Section 4.2, 6.1)
app.use("/api/connections", connectionsRouter);

// Chat messages routes (TRD Section 4.3, 6.1)
app.use("/api/connections", chatRouter);

// Reports routes (TRD Section 7.2)
app.use("/api/reports", reportsRouter);

// Admin routes (TRD Section 6.1, 7.2)
app.use("/api/admin", adminRouter);

// Notifications routes (TRD Section 6.1, 6.3)
app.use("/api/notifications", notificationsRouter);

// Root welcome route
app.get("/", (req, res) => {
  res.send("ConnectLocal API is running");
});

// Start server and connect to MongoDB
let server;

async function startServer() {
  // Validate secrets fail-fast at boot time
  getJwtSecret();
  getAdminKey();

  try {
    await connectDB();
  } catch (err) {
    console.error("Database connection error on startup:", err.message);
  }

  server = httpServer.listen(PORT, HOST, () => {
    console.log(`Express server and Socket.io listening on ${HOST}:${PORT}`);
  });

  return server;
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch((err) => {
    console.error(`Startup failure: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  app,
  httpServer,
  io,
  startServer,
  get server() {
    return server || httpServer;
  },
};
