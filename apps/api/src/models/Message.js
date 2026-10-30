const mongoose = require("mongoose");
const { Schema } = mongoose;

const MessageSchema = new Schema(
  {
    connectionId: {
      type: Schema.Types.ObjectId,
      ref: "Connection",
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // MVP is text-only — no voice/video (per PRD Section 8 / TRD scope).
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Fetching a thread's history in order (TRD 4.6)
MessageSchema.index({ connectionId: 1, createdAt: 1 });

// Unread count queries and mark-read lookups
MessageSchema.index({ connectionId: 1, senderId: 1, readAt: 1 });

/**
 * Application-layer rule (enforce in the chat service):
 * a message can only be created if the parent Connection.status === "accepted".
 */
module.exports =
  mongoose.models.Message || mongoose.model("Message", MessageSchema);
