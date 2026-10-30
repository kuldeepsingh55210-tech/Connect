const express = require("express");
const mongoose = require("mongoose");
const { Connection, User, Message } = require("../../models");
const { requireAuth } = require("../../middleware/auth");
const {
  notify,
  markConnectRequestRead,
  deleteConnectRequest,
  clearNotificationsForConnection,
} = require("../notifications");

const router = express.Router();

/**
 * Helper to get rolling 24h connect limit
 */
const MAX_DAILY_CONNECTS = parseInt(process.env.RATE_LIMIT_CONNECT_PER_DAY, 10) || 20;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/connections/block
 * Protected by requireAuth.
 * Body: { toUserId }
 *
 * Creates or updates the connection straight to 'blocked' status,
 * bypassing the normal pending flow.
 */
router.post("/block", requireAuth, async (req, res) => {
  try {
    const { toUserId } = req.body;

    if (!toUserId) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "toUserId is required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(toUserId)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Invalid toUserId format.",
      });
    }

    if (toUserId.toString() === req.user.id.toString()) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Cannot block yourself.",
      });
    }

    const pair = Connection.sortedPair(req.user.id, toUserId);
    let connection = await Connection.findOne(pair);

    if (connection) {
      connection.status = "blocked";
      connection.initiatedBy = req.user.id;
      connection.respondedAt = new Date();
      await connection.save();
    } else {
      connection = await Connection.create({
        userA: pair.userA,
        userB: pair.userB,
        initiatedBy: req.user.id,
        status: "blocked",
        respondedAt: new Date(),
      });
    }

    // Delete all notifications between that pair for that connection
    await clearNotificationsForConnection(connection._id);

    return res.status(200).json({
      status: "ok",
      message: "User blocked successfully.",
      connection,
    });
  } catch (err) {
    console.error("[connections] POST /block error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * POST /api/connections
 * Protected by requireAuth.
 * Body: { toUserId }
 *
 * Rules:
 * - Cannot connect to yourself (400)
 * - Both users must have completed profiles (403 PROFILE_REQUIRED)
 * - Rate limit: max 20 successful connects per rolling 24h window (429 RATE_LIMITED)
 * - Unique pair check:
 *     - If status is 'pending' or 'accepted' -> 409 Conflict
 *     - If status is 'blocked' -> 403 Forbidden
 *     - If status is 'ignored' or 'unmatched' -> reset to 'pending' with new initiatedBy
 * - Returns 201 with created/updated connection
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { toUserId } = req.body;

    if (!toUserId) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "toUserId is required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(toUserId)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Invalid toUserId format.",
      });
    }

    if (toUserId.toString() === req.user.id.toString()) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Cannot connect to yourself.",
      });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(req.user.id),
      User.findById(toUserId),
    ]);

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "User not found.",
      });
    }

    if (!currentUser.profileCompleted || !targetUser.profileCompleted) {
      return res.status(403).json({
        error: "PROFILE_REQUIRED",
        message: "Both users must have completed profiles to connect.",
      });
    }

    // Rate limiting: rolling 24-hour counter
    const now = Date.now();
    const resetAt = currentUser.dailyConnectCountResetAt
      ? new Date(currentUser.dailyConnectCountResetAt).getTime()
      : 0;

    if (now - resetAt > ONE_DAY_MS) {
      currentUser.dailyConnectCount = 0;
      currentUser.dailyConnectCountResetAt = new Date(now);
    }

    if (currentUser.dailyConnectCount >= MAX_DAILY_CONNECTS) {
      return res.status(429).json({
        error: "RATE_LIMITED",
        message: "Daily connect limit reached.",
      });
    }

    // Lookup existing connection via sortedPair helper
    const pair = Connection.sortedPair(currentUser._id, targetUser._id);
    let connection = await Connection.findOne(pair);

    if (connection) {
      if (connection.status === "pending" || connection.status === "accepted") {
        return res.status(409).json({
          error: "CONFLICT",
          message: `A connection request between these users is already ${connection.status}.`,
        });
      }

      if (connection.status === "blocked") {
        return res.status(403).json({
          error: "BLOCKED",
          message: "Cannot connect with this user.",
        });
      }

      // Reopen ignored or unmatched request
      connection.status = "pending";
      connection.initiatedBy = currentUser._id;
      connection.respondedAt = null;
      await connection.save();
    } else {
      connection = await Connection.create({
        userA: pair.userA,
        userB: pair.userB,
        initiatedBy: currentUser._id,
        status: "pending",
        respondedAt: null,
      });
    }

    // Increment daily connect counter on successful connection request
    currentUser.dailyConnectCount += 1;
    await currentUser.save();

    // Notify recipient of connection request
    const io = req.app.get("io");
    await notify({
      io,
      userId: targetUser._id,
      actorId: currentUser._id,
      connectionId: connection._id,
      type: "connect_request",
    });

    return res.status(201).json({
      message: "Connection request sent successfully.",
      connection,
    });
  } catch (err) {
    console.error("[connections] POST / error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * GET /api/connections/unread-count
 * Protected by requireAuth.
 *
 * Returns { total } = total unread messages across the user's ACCEPTED connections only
 * (blocked/unmatched excluded).
 * Registered before any /:id routes so it is not captured as an id.
 */
router.get("/unread-count", requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    // Find all accepted connections for this user (excludes blocked/unmatched/pending/ignored)
    const acceptedConnections = await Connection.find({
      $or: [{ userA: currentUserId }, { userB: currentUserId }],
      status: "accepted",
    }).select("_id");

    const connectionIds = acceptedConnections.map((c) => c._id);

    if (connectionIds.length === 0) {
      return res.status(200).json({ total: 0 });
    }

    const total = await Message.countDocuments({
      connectionId: { $in: connectionIds },
      senderId: { $ne: currentUserId },
      readAt: null,
    });

    return res.status(200).json({ total });
  } catch (err) {
    console.error("[connections] GET /unread-count error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * GET /api/connections?status=pending|accepted|sent
 * Protected by requireAuth.
 *
 * - "pending"  = Incoming requests where other user initiated and status is pending
 * - "sent"     = Outgoing requests current user initiated and status is pending
 * - "accepted" = Mutual connections (status is accepted)
 *
 * Returns each row with OTHER user's public profile fields + connection status and createdAt.
 * For status=accepted, also adds unreadCount, lastMessageAt, lastMessagePreview, lastMessageIsMine,
 * sorted by lastMessageAt descending, falling back to respondedAt.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const currentUserId = req.user.id;

    if (status && !["pending", "accepted", "sent"].includes(status)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "status query parameter must be one of: pending, accepted, sent.",
      });
    }

    const isAccepted = !status || status === "accepted";

    let filter = {};
    if (status === "pending") {
      filter = {
        $or: [{ userA: currentUserId }, { userB: currentUserId }],
        status: "pending",
        initiatedBy: { $ne: currentUserId },
      };
    } else if (status === "sent") {
      filter = {
        $or: [{ userA: currentUserId }, { userB: currentUserId }],
        status: "pending",
        initiatedBy: currentUserId,
      };
    } else {
      // Default or accepted
      filter = {
        $or: [{ userA: currentUserId }, { userB: currentUserId }],
        status: "accepted",
      };
    }

    const connections = await Connection.find(filter).sort({ createdAt: -1 });

    let statsMap = new Map();
    if (isAccepted && connections.length > 0) {
      const connectionIds = connections.map((c) => c._id);
      const messageStats = await Message.aggregate([
        {
          $match: {
            connectionId: { $in: connectionIds },
          },
        },
        {
          $sort: { createdAt: -1, _id: -1 },
        },
        {
          $group: {
            _id: "$connectionId",
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {
                        $ne: [
                          "$senderId",
                          new mongoose.Types.ObjectId(currentUserId.toString()),
                        ],
                      },
                      { $eq: ["$readAt", null] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            lastMessageText: { $first: "$text" },
            lastMessageAt: { $first: "$createdAt" },
            lastMessageSenderId: { $first: "$senderId" },
          },
        },
      ]);

      for (const row of messageStats) {
        statsMap.set(row._id.toString(), row);
      }
    }

    const results = await Promise.all(
      connections.map(async (conn) => {
        const otherUserId = Connection.otherUserId(conn, currentUserId);
        const otherUser = await User.findById(otherUserId);
        if (!otherUser) return null;

        const publicProfile = {
          id: otherUser._id,
          name: otherUser.name,
          city: otherUser.city,
          photoUrl: otherUser.photoUrl,
          skills: otherUser.skills,
          interests: otherUser.interests,
          intent: otherUser.intent,
        };

        const baseRow = {
          connectionId: conn._id,
          status: conn.status,
          createdAt: conn.createdAt,
          respondedAt: conn.respondedAt,
          user: publicProfile,
          ...publicProfile,
        };

        if (isAccepted) {
          const stats = statsMap.get(conn._id.toString());
          const unreadCount = stats ? stats.unreadCount : 0;
          const lastMessageAt = stats && stats.lastMessageAt ? stats.lastMessageAt : null;
          const lastMessagePreview =
            stats && stats.lastMessageText
              ? stats.lastMessageText.length > 80
                ? stats.lastMessageText.slice(0, 80)
                : stats.lastMessageText
              : null;
          const lastMessageIsMine =
            stats && stats.lastMessageSenderId
              ? stats.lastMessageSenderId.toString() === currentUserId.toString()
              : false;

          return {
            ...baseRow,
            unreadCount,
            lastMessageAt,
            lastMessagePreview,
            lastMessageIsMine,
          };
        }

        return baseRow;
      })
    );

    let filteredResults = results.filter(Boolean);

    if (isAccepted) {
      filteredResults.sort((a, b) => {
        const timeA = a.lastMessageAt
          ? new Date(a.lastMessageAt).getTime()
          : a.respondedAt
          ? new Date(a.respondedAt).getTime()
          : a.createdAt
          ? new Date(a.createdAt).getTime()
          : 0;
        const timeB = b.lastMessageAt
          ? new Date(b.lastMessageAt).getTime()
          : b.respondedAt
          ? new Date(b.respondedAt).getTime()
          : b.createdAt
          ? new Date(b.createdAt).getTime()
          : 0;
        return timeB - timeA;
      });
    }

    return res.status(200).json({
      status: "ok",
      connections: filteredResults,
    });
  } catch (err) {
    console.error("[connections] GET / error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * PATCH /api/connections/:id
 * Protected by requireAuth.
 * Body: { action }
 *
 * Actions:
 * - "accept": only non-initiator can accept pending -> 'accepted', sets respondedAt
 * - "ignore": only non-initiator can ignore pending -> 'ignored', sets respondedAt
 * - "unmatch": either user in 'accepted' connection -> 'unmatched'
 * - "block": either user can block regardless of current status -> 'blocked'
 */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const { action } = req.body;
    const currentUserId = req.user.id.toString();

    if (!action || !["accept", "ignore", "unmatch", "block"].includes(action)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "action must be one of: accept, ignore, unmatch, block.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Invalid connection ID format.",
      });
    }

    const connection = await Connection.findById(req.params.id);

    if (!connection) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Connection not found.",
      });
    }

    // Verify user is a participant
    const isParticipant =
      connection.userA.toString() === currentUserId ||
      connection.userB.toString() === currentUserId;

    if (!isParticipant) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "You are not a participant in this connection.",
      });
    }

    const isInitiator = connection.initiatedBy.toString() === currentUserId;

    if (action === "accept") {
      if (connection.status !== "pending") {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: `Cannot accept a connection with status '${connection.status}'.`,
        });
      }
      if (isInitiator) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "The requester cannot accept their own connect request.",
        });
      }
      connection.status = "accepted";
      connection.respondedAt = new Date();
    } else if (action === "ignore") {
      if (connection.status !== "pending") {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: `Cannot ignore a connection with status '${connection.status}'.`,
        });
      }
      if (isInitiator) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "The requester cannot ignore their own connect request.",
        });
      }
      connection.status = "ignored";
      connection.respondedAt = new Date();
    } else if (action === "unmatch") {
      if (connection.status !== "accepted") {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: `Cannot unmatch a connection with status '${connection.status}'. Only accepted connections can be unmatched.`,
        });
      }
      connection.status = "unmatched";
    } else if (action === "block") {
      connection.status = "blocked";
    }

    await connection.save();

    // Hook notifications based on action
    const io = req.app.get("io");
    if (action === "accept") {
      await notify({
        io,
        userId: connection.initiatedBy,
        actorId: currentUserId,
        connectionId: connection._id,
        type: "connection_accepted",
      });
      await markConnectRequestRead({
        userId: currentUserId,
        connectionId: connection._id,
      });
    } else if (action === "ignore") {
      await deleteConnectRequest({
        userId: currentUserId,
        connectionId: connection._id,
      });
    } else if (action === "unmatch" || action === "block") {
      await clearNotificationsForConnection(connection._id);
    }

    const actionPastTense = {
      accept: "accepted",
      ignore: "ignored",
      unmatch: "unmatched",
      block: "blocked",
    }[action] || `${action}ed`;

    return res.status(200).json({
      message: `Connection ${actionPastTense} successfully.`,
      connection,
    });
  } catch (err) {
    console.error("[connections] PATCH /:id error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

module.exports = router;
