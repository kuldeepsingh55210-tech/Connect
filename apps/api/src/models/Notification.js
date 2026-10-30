const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["connect_request", "connection_accepted", "new_message"],
      required: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Connection",
      required: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Feed ordering index
NotificationSchema.index({ userId: 1, createdAt: -1 });

// Unread query index
NotificationSchema.index({ userId: 1, readAt: 1 });

// Unique partial index: at most ONE unread new_message notification per { userId, connectionId }
NotificationSchema.index(
  { userId: 1, connectionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "new_message",
      readAt: null,
    },
  }
);

module.exports = mongoose.model("Notification", NotificationSchema);
