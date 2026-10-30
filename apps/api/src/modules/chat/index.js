const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { Message, Connection } = require("../../models");
const { requireAuth } = require("../../middleware/auth");
const {
  notify,
  markThreadNotificationsRead,
} = require("../notifications");

const router = express.Router();

/**
 * GET /api/connections/:id/messages
 * Protected by requireAuth.
 *
 * Rules:
 * - Requesting user must be participant AND connection.status === 'accepted' (403 NOT_CONNECTED)
 * - Returns messages oldest first
 * - Cursor-based pagination: ?before=<messageId> (default page size 30)
 */
router.get("/:id/messages", requireAuth, async (req, res) => {
  try {
    const connectionId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Invalid connection ID format.",
      });
    }

    const connection = await Connection.findById(connectionId);
    if (!connection) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Connection not found.",
      });
    }

    const userId = req.user.id.toString();
    const isParticipant =
      connection.userA.toString() === userId ||
      connection.userB.toString() === userId;

    if (!isParticipant || connection.status !== "accepted") {
      return res.status(403).json({
        error: "NOT_CONNECTED",
        message: "You can only view messages for accepted connections.",
      });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    let messages;

    if (req.query.before && mongoose.Types.ObjectId.isValid(req.query.before)) {
      const cursorMsg = await Message.findById(req.query.before);
      const query = { connectionId: connection._id };

      if (cursorMsg) {
        query.createdAt = { $lt: cursorMsg.createdAt };
      } else {
        query._id = { $lt: req.query.before };
      }

      const olderMessages = await Message.find(query)
        .sort({ createdAt: -1 })
        .limit(limit);

      messages = olderMessages.reverse();
    } else {
      messages = await Message.find({ connectionId: connection._id })
        .sort({ createdAt: 1 })
        .limit(limit);
    }

    const formattedMessages = messages.map((m) => ({
      id: m._id,
      _id: m._id,
      connectionId: m.connectionId,
      senderId: m.senderId,
      text: m.text,
      readAt: m.readAt,
      createdAt: m.createdAt,
    }));

    return res.status(200).json({
      status: "ok",
      messages: formattedMessages,
      count: formattedMessages.length,
    });
  } catch (err) {
    console.error("[chat] GET /:id/messages error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * POST /api/connections/:id/messages
 * Protected by requireAuth.
 *
 * Rules:
 * - Requesting user must be participant AND connection.status === 'accepted' (403 NOT_CONNECTED)
 * - Body: { text } (max 2000 chars, non-empty)
 * - Persists message to DB
 * - Emits message:new to Socket.io room for connectionId
 */
router.post("/:id/messages", requireAuth, async (req, res) => {
  try {
    const connectionId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Invalid connection ID format.",
      });
    }

    const connection = await Connection.findById(connectionId);
    if (!connection) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Connection not found.",
      });
    }

    const userId = req.user.id.toString();
    const isParticipant =
      connection.userA.toString() === userId ||
      connection.userB.toString() === userId;

    if (!isParticipant || connection.status !== "accepted") {
      return res.status(403).json({
        error: "NOT_CONNECTED",
        message: "You can only send messages to accepted connections.",
      });
    }

    const { text } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Message text cannot be empty.",
      });
    }

    if (text.trim().length > 2000) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Message text cannot exceed 2000 characters.",
      });
    }

    const message = await Message.create({
      connectionId: connection._id,
      senderId: req.user.id,
      text: text.trim(),
      readAt: null,
    });

    const messagePayload = {
      id: message._id,
      _id: message._id,
      connectionId: message.connectionId,
      senderId: message.senderId,
      text: message.text,
      readAt: message.readAt,
      createdAt: message.createdAt,
    };

    // Emit via Socket.io if available
    const io = req.app.get("io");
    if (io) {
      io.to(connection._id.toString()).emit("message:new", messagePayload);
    }

    // Upsert unread new_message notification for recipient
    const recipientId =
      connection.userA.toString() === userId
        ? connection.userB
        : connection.userA;

    await notify({
      io,
      userId: recipientId,
      actorId: req.user.id,
      connectionId: connection._id,
      type: "new_message",
    });

    return res.status(201).json({
      message: "Message sent successfully.",
      data: messagePayload,
      ...messagePayload,
    });
  } catch (err) {
    console.error("[chat] POST /:id/messages error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * POST /api/connections/:id/read
 * Protected by requireAuth.
 *
 * Rules:
 * - Requesting user must be participant AND connection.status === 'accepted' (403 NOT_CONNECTED)
 * - Marks all messages in thread where senderId != req.user.id and readAt == null as read
 * - Returns { status: "ok", readAt, count }
 * - Emits "message:read" to the connection room with { connectionId, readerId, readAt } if count > 0
 */
router.post("/:id/read", requireAuth, async (req, res) => {
  try {
    const connectionId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Invalid connection ID format.",
      });
    }

    const connection = await Connection.findById(connectionId);
    if (!connection) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Connection not found.",
      });
    }

    const userId = req.user.id.toString();
    const isParticipant =
      connection.userA.toString() === userId ||
      connection.userB.toString() === userId;

    if (!isParticipant || connection.status !== "accepted") {
      return res.status(403).json({
        error: "NOT_CONNECTED",
        message: "You can only mark messages as read for accepted connections.",
      });
    }

    const now = new Date();
    const updateResult = await Message.updateMany(
      {
        connectionId: connection._id,
        senderId: { $ne: req.user.id },
        readAt: null,
      },
      {
        $set: { readAt: now },
      }
    );

    const count = updateResult.modifiedCount || 0;

    const io = req.app.get("io");
    if (count > 0 && io) {
      io.to(connection._id.toString()).emit("message:read", {
        connectionId: connection._id.toString(),
        readerId: userId,
        readAt: now,
      });
    }

    // Mark reader's new_message notification for this connection as read
    await markThreadNotificationsRead({
      userId,
      connectionId: connection._id,
    });

    return res.status(200).json({
      status: "ok",
      readAt: now,
      count,
    });
  } catch (err) {
    console.error("[chat] POST /:id/read error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * Socket.io chat event handler initialization
 */
function initChatSocket(io) {
  // Socket Auth Middleware
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization &&
      socket.handshake.headers.authorization.startsWith("Bearer ")
        ? socket.handshake.headers.authorization.split(" ")[1]
        : null);

    if (!token) {
      return next(new Error("Authentication error: Token missing"));
    }

    const secret = process.env.JWT_SECRET || "connectlocal_dev_secret_key_2026";
    try {
      const decoded = jwt.verify(token, secret);
      socket.data.userId = (decoded.id || decoded.userId).toString();
      socket.data.authId = decoded.authId;
      next();
    } catch (err) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);

    // Client emits "thread:join" with { connectionId }
    socket.on("thread:join", async (data, callback) => {
      try {
        const { connectionId } = data || {};
        if (!connectionId || !mongoose.Types.ObjectId.isValid(connectionId)) {
          socket.emit("message:error", {
            error: "BAD_REQUEST",
            message: "Valid connectionId is required.",
          });
          if (callback) callback({ error: "BAD_REQUEST" });
          return;
        }

        const connection = await Connection.findById(connectionId);
        if (!connection) {
          socket.emit("message:error", {
            error: "NOT_FOUND",
            message: "Connection not found.",
          });
          if (callback) callback({ error: "NOT_FOUND" });
          return;
        }

        const isParticipant =
          connection.userA.toString() === userId ||
          connection.userB.toString() === userId;

        if (!isParticipant || connection.status !== "accepted") {
          socket.emit("message:error", {
            error: "NOT_CONNECTED",
            message: "Cannot join thread. You must be an accepted connection participant.",
          });
          if (callback) callback({ error: "NOT_CONNECTED" });
          return;
        }

        socket.join(connectionId.toString());
        socket.emit("thread:joined", { connectionId });
        if (callback) callback({ status: "ok", connectionId });
      } catch (err) {
        console.error("[socket] thread:join error:", err);
        socket.emit("message:error", {
          error: "INTERNAL_SERVER_ERROR",
          message: err.message,
        });
      }
    });

    // Client emits "message:send" with { connectionId, text }
    socket.on("message:send", async (data, callback) => {
      try {
        const { connectionId, text } = data || {};

        if (!connectionId || !mongoose.Types.ObjectId.isValid(connectionId)) {
          socket.emit("message:error", {
            error: "BAD_REQUEST",
            message: "Valid connectionId is required.",
          });
          if (callback) callback({ error: "BAD_REQUEST" });
          return;
        }

        if (!text || typeof text !== "string" || !text.trim()) {
          socket.emit("message:error", {
            error: "BAD_REQUEST",
            message: "Message text cannot be empty.",
          });
          if (callback) callback({ error: "BAD_REQUEST" });
          return;
        }

        if (text.trim().length > 2000) {
          socket.emit("message:error", {
            error: "BAD_REQUEST",
            message: "Message text cannot exceed 2000 characters.",
          });
          if (callback) callback({ error: "BAD_REQUEST" });
          return;
        }

        const connection = await Connection.findById(connectionId);
        if (!connection) {
          socket.emit("message:error", {
            error: "NOT_FOUND",
            message: "Connection not found.",
          });
          if (callback) callback({ error: "NOT_FOUND" });
          return;
        }

        const isParticipant =
          connection.userA.toString() === userId ||
          connection.userB.toString() === userId;

        if (!isParticipant || connection.status !== "accepted") {
          socket.emit("message:error", {
            error: "NOT_CONNECTED",
            message: "You can only send messages to accepted connections.",
          });
          if (callback) callback({ error: "NOT_CONNECTED" });
          return;
        }

        const message = await Message.create({
          connectionId: connection._id,
          senderId: userId,
          text: text.trim(),
          readAt: null,
        });

        const messagePayload = {
          id: message._id,
          _id: message._id,
          connectionId: message.connectionId,
          senderId: message.senderId,
          text: message.text,
          readAt: message.readAt,
          createdAt: message.createdAt,
        };

        io.to(connectionId.toString()).emit("message:new", messagePayload);

        // Upsert unread new_message notification for recipient
        const recipientId =
          connection.userA.toString() === userId
            ? connection.userB
            : connection.userA;

        await notify({
          io,
          userId: recipientId,
          actorId: userId,
          connectionId: connection._id,
          type: "new_message",
        });

        if (callback) callback({ status: "ok", message: messagePayload });
      } catch (err) {
        console.error("[socket] message:send error:", err);
        socket.emit("message:error", {
          error: "INTERNAL_SERVER_ERROR",
          message: err.message,
        });
      }
    });

    // Client emits "message:read" with { connectionId }
    socket.on("message:read", async (data) => {
      try {
        const { connectionId } = data || {};
        if (!connectionId || !mongoose.Types.ObjectId.isValid(connectionId)) return;

        const connection = await Connection.findById(connectionId);
        if (!connection) return;

        const isParticipant =
          connection.userA.toString() === userId ||
          connection.userB.toString() === userId;

        if (!isParticipant || connection.status !== "accepted") return;

        const now = new Date();
        const updateResult = await Message.updateMany(
          {
            connectionId,
            senderId: { $ne: userId },
            readAt: null,
          },
          {
            $set: { readAt: now },
          }
        );

        if (updateResult.modifiedCount > 0) {
          socket.to(connectionId.toString()).emit("message:read", {
            connectionId: connectionId.toString(),
            readerId: userId,
            readAt: now,
          });
        }

        socket.emit("message:read:ack", { connectionId, readAt: now });

        // Mark reader's new_message notification for this connection as read
        await markThreadNotificationsRead({
          userId,
          connectionId,
        });
      } catch (err) {
        console.error("[socket] message:read error:", err);
      }
    });
  });
}

module.exports = {
  chatRouter: router,
  initChatSocket,
};
