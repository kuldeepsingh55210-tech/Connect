const express = require("express");
const mongoose = require("mongoose");
const { Notification, User, Connection } = require("../../models");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

/**
 * Check whether a notification is currently valid to display / count:
 * - Actor must exist, status not in [hidden_pending_review, banned, soft_deleted], deletedAt is null
 * - Connection must exist
 * - If type is 'connect_request', connection.status must be 'pending'
 * - If type is 'connection_accepted' or 'new_message', connection.status must be 'accepted'
 */
function isNotificationValid(notification, actor, connection) {
  if (!actor || !connection) {
    return false;
  }

  const INVALID_ACTOR_STATUSES = [
    "hidden_pending_review",
    "banned",
    "soft_deleted",
  ];
  if (INVALID_ACTOR_STATUSES.includes(actor.status) || actor.deletedAt) {
    return false;
  }

  if (notification.type === "connect_request") {
    return connection.status === "pending";
  }

  if (
    notification.type === "connection_accepted" ||
    notification.type === "new_message"
  ) {
    return connection.status === "accepted";
  }

  return false;
}

/**
 * Format public actor profile for notification payload.
 * Never includes dob, gender, authId, phone, exact age, area, status.
 */
function formatPublicActor(actor) {
  if (!actor) return null;
  return {
    id: actor._id || actor.id,
    name: actor.name || "Member",
    city: actor.city || "",
    photoUrl: actor.photoUrl || null,
  };
}

/**
 * Create or update a notification and emit real-time event
 */
async function notify({ io, userId, actorId, connectionId, type }) {
  try {
    if (!userId || !actorId || !connectionId || !type) return null;

    // Never notify yourself
    if (userId.toString() === actorId.toString()) return null;

    const [actor, connection] = await Promise.all([
      User.findById(actorId),
      Connection.findById(connectionId),
    ]);

    if (!actor || !connection) return null;

    // Must be valid for the type
    if (type === "connect_request" && connection.status !== "pending") return null;
    if (
      (type === "connection_accepted" || type === "new_message") &&
      connection.status !== "accepted"
    ) {
      return null;
    }

    const now = new Date();
    let notification;

    if (type === "new_message") {
      // Upsert ONE unread new_message notification per connection for the recipient
      try {
        notification = await Notification.findOneAndUpdate(
          {
            userId,
            connectionId,
            type: "new_message",
            readAt: null,
          },
          {
            $set: {
              actorId,
              readAt: null,
              createdAt: now,
              updatedAt: now,
            },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        );
      } catch (err) {
        // Handle race condition on unique partial index
        notification = await Notification.findOne({
          userId,
          connectionId,
          type: "new_message",
          readAt: null,
        });
        if (notification) {
          notification.actorId = actorId;
          notification.updatedAt = now;
          notification.createdAt = now;
          await notification.save();
        }
      }
    } else if (type === "connect_request") {
      // Upsert connect_request notification so no duplicates exist for same pending connection
      notification = await Notification.findOneAndUpdate(
        {
          userId,
          connectionId,
          type: "connect_request",
        },
        {
          $set: {
            actorId,
            readAt: null,
            createdAt: now,
            updatedAt: now,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );
    } else if (type === "connection_accepted") {
      notification = await Notification.create({
        userId,
        actorId,
        connectionId,
        type: "connection_accepted",
        readAt: null,
      });
    }

    if (notification && io) {
      const publicActor = formatPublicActor(actor);
      io.to(`user:${userId.toString()}`).emit("notification:new", {
        id: notification._id,
        _id: notification._id,
        type: notification.type,
        connectionId: notification.connectionId,
        createdAt: notification.createdAt,
        actor: publicActor,
      });
    }

    return notification;
  } catch (err) {
    console.error("[notifications] notify helper error:", err);
    return null;
  }
}

/**
 * Mark recipient's own connect_request as read when connection is accepted
 */
async function markConnectRequestRead({ userId, connectionId }) {
  try {
    await Notification.updateMany(
      {
        userId,
        connectionId,
        type: "connect_request",
        readAt: null,
      },
      {
        $set: { readAt: new Date() },
      }
    );
  } catch (err) {
    console.error("[notifications] markConnectRequestRead error:", err);
  }
}

/**
 * Delete recipient's connect_request notification when ignored
 */
async function deleteConnectRequest({ userId, connectionId }) {
  try {
    await Notification.deleteMany({
      userId,
      connectionId,
      type: "connect_request",
    });
  } catch (err) {
    console.error("[notifications] deleteConnectRequest error:", err);
  }
}

/**
 * Delete all notifications between the pair for that connection on block/unmatch
 */
async function clearNotificationsForConnection(connectionId) {
  try {
    await Notification.deleteMany({ connectionId });
  } catch (err) {
    console.error("[notifications] clearNotificationsForConnection error:", err);
  }
}

/**
 * Mark connection's new_message notification for reader as read
 */
async function markThreadNotificationsRead({ userId, connectionId }) {
  try {
    await Notification.updateMany(
      {
        userId,
        connectionId,
        type: "new_message",
        readAt: null,
      },
      {
        $set: { readAt: new Date() },
      }
    );
  } catch (err) {
    console.error("[notifications] markThreadNotificationsRead error:", err);
  }
}

// -------------------------------------------------------------
// Endpoints (Static routes registered BEFORE /:id)
// -------------------------------------------------------------

/**
 * GET /api/notifications/unread-count
 * Returns { total } counting only valid unread notifications.
 */
router.get("/unread-count", requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const unreadNotifications = await Notification.find({
      userId: currentUserId,
      readAt: null,
    })
      .populate("actorId")
      .populate("connectionId");

    const validUnread = unreadNotifications.filter((n) =>
      isNotificationValid(n, n.actorId, n.connectionId)
    );

    return res.status(200).json({ total: validUnread.length });
  } catch (err) {
    console.error("[notifications] GET /unread-count error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * POST /api/notifications/read-all
 * Marks all of requesting user's unread notifications as read.
 * Returns { count }
 */
router.post("/read-all", requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const now = new Date();

    const result = await Notification.updateMany(
      {
        userId: currentUserId,
        readAt: null,
      },
      {
        $set: { readAt: now },
      }
    );

    return res.status(200).json({
      status: "ok",
      count: result.modifiedCount || 0,
    });
  } catch (err) {
    console.error("[notifications] POST /read-all error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * GET /api/notifications?limit=30&before=<ISO date>
 * Returns list of notifications for requesting user, newest first.
 * Max limit: 50 per page.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 30, 1),
      50
    );

    const filter = { userId: currentUserId };

    if (req.query.before) {
      const beforeDate = new Date(req.query.before);
      if (!isNaN(beforeDate.getTime())) {
        filter.createdAt = { $lt: beforeDate };
      }
    }

    // Fetch batch to allow filtering out invalid ones
    const candidateNotifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 2)
      .populate("actorId")
      .populate("connectionId");

    const validItems = [];
    for (const n of candidateNotifications) {
      if (isNotificationValid(n, n.actorId, n.connectionId)) {
        validItems.push({
          id: n._id,
          _id: n._id,
          type: n.type,
          connectionId: (n.connectionId?._id || n.connectionId).toString(),
          readAt: n.readAt,
          createdAt: n.createdAt,
          actor: formatPublicActor(n.actorId),
        });
      }
      if (validItems.length >= limit) {
        break;
      }
    }

    return res.status(200).json({
      status: "ok",
      notifications: validItems,
      count: validItems.length,
    });
  } catch (err) {
    console.error("[notifications] GET / error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Marks single notification as read.
 * Returns 404 if not found or not owner (does not reveal existence).
 * Idempotent.
 */
router.patch("/:id/read", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Notification not found.",
      });
    }

    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Notification not found.",
      });
    }

    // Strict ownership: 404 for others to avoid revealing existence
    if (notification.userId.toString() !== req.user.id.toString()) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Notification not found.",
      });
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await notification.save();
    }

    return res.status(200).json({
      status: "ok",
      notification: {
        id: notification._id,
        _id: notification._id,
        type: notification.type,
        connectionId: notification.connectionId,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      },
    });
  } catch (err) {
    console.error("[notifications] PATCH /:id/read error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

module.exports = router;
module.exports.notificationsRouter = router;
module.exports.notify = notify;
module.exports.markConnectRequestRead = markConnectRequestRead;
module.exports.deleteConnectRequest = deleteConnectRequest;
module.exports.clearNotificationsForConnection = clearNotificationsForConnection;
module.exports.markThreadNotificationsRead = markThreadNotificationsRead;
