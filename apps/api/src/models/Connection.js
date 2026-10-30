const mongoose = require("mongoose");
const { Schema } = mongoose;

const ConnectionSchema = new Schema(
  {
    // Always stored sorted so userA < userB (compare _id as strings) at the
    // application layer before save. Guarantees exactly one document per pair.
    userA: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userB: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Which of userA/userB sent the original Connect request.
    initiatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "ignored", "unmatched", "blocked"],
      default: "pending",
      index: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt = when Connect was sent
  }
);

// Prevents duplicate connection documents for the same pair.
ConnectionSchema.index({ userA: 1, userB: 1 }, { unique: true });

// "My connections by status" lookups (TRD 4.6)
ConnectionSchema.index({ userA: 1, status: 1 });
ConnectionSchema.index({ userB: 1, status: 1 });

/**
 * Helper: given a connection doc and one of the two user ids in it,
 * returns the OTHER user's id. Used by Tier 3 matching logic (TRD 5.3).
 */
ConnectionSchema.statics.otherUserId = function (connectionDoc, knownUserId) {
  const known = knownUserId.toString();
  return connectionDoc.userA.toString() === known
    ? connectionDoc.userB
    : connectionDoc.userA;
};

/**
 * Helper: build a sorted [userA, userB] pair so callers never have to
 * remember the sort-order invariant.
 */
ConnectionSchema.statics.sortedPair = function (idOne, idTwo) {
  const [a, b] = [idOne.toString(), idTwo.toString()].sort();
  return { userA: a, userB: b };
};

module.exports =
  mongoose.models.Connection || mongoose.model("Connection", ConnectionSchema);
