const mongoose = require("mongoose");
const { Schema } = mongoose;

const ReportSchema = new Schema(
  {
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reportedUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ["spam", "fake_profile", "harassment", "inappropriate_photo", "other"],
      required: true,
    },
    details: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    status: {
      type: String,
      enum: ["open", "reviewed_no_action", "actioned"],
      default: "open",
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Powers the auto-hide rule (TRD 7.2): count open reports for a user.
ReportSchema.index({ reportedUserId: 1, status: 1 });
ReportSchema.index({ reporterId: 1, reportedUserId: 1, status: 1 });

/**
 * Auto-hide threshold, referenced by the trust-safety service after
 * a new report is created (TRD Section 7.2):
 *
 * const openCount = await Report.countDocuments({
 *   reportedUserId: X, status: "open"
 * });
 * if (openCount >= Report.AUTO_HIDE_THRESHOLD) {
 *   await User.updateOne({ _id: X }, { status: "hidden_pending_review" });
 * }
 */
ReportSchema.statics.AUTO_HIDE_THRESHOLD = 3;

module.exports =
  mongoose.models.Report || mongoose.model("Report", ReportSchema);
