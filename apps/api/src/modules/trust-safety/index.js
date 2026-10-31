const express = require("express");
const mongoose = require("mongoose");
const { Report, User } = require("../../models");
const { requireAuth } = require("../../middleware/auth");
const { getAdminKey } = require("../../config/secrets");

// TEMPORARY ADMIN AUTH — replace with role-based admin auth before public launch. See TRD Section 6.1.
function requireAdminKey(req, res, next) {
  const adminKey = req.headers["x-admin-key"];
  const expectedKey = getAdminKey();

  if (!adminKey || adminKey !== expectedKey) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Admin authentication failed: Missing or invalid x-admin-key header.",
    });
  }
  next();
}

const reportsRouter = express.Router();
const adminRouter = express.Router();

/**
 * POST /api/reports
 * Protected by requireAuth.
 * Body: { reportedUserId, reason, details }
 */
reportsRouter.post("/", requireAuth, async (req, res) => {
  try {
    const { reportedUserId, reason, details } = req.body;
    const currentUserId = req.user.id.toString();

    if (!reportedUserId || !mongoose.Types.ObjectId.isValid(reportedUserId)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Valid reportedUserId is required.",
      });
    }

    if (reportedUserId.toString() === currentUserId) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Cannot report yourself.",
      });
    }

    const ALLOWED_REASONS = [
      "spam",
      "fake_profile",
      "harassment",
      "inappropriate_photo",
      "other",
    ];

    if (!reason || !ALLOWED_REASONS.includes(reason)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: `reason must be one of: ${ALLOWED_REASONS.join(", ")}`,
      });
    }

    if (details && (typeof details !== "string" || details.trim().length > 500)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "details cannot exceed 500 characters.",
      });
    }

    const [currentUser, reportedUser] = await Promise.all([
      User.findById(req.user.id),
      User.findById(reportedUserId),
    ]);

    if (!reportedUser) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Reported user not found.",
      });
    }

    // Reject duplicate open report from same reporter (Fix A)
    const existingOpenReport = await Report.findOne({
      reporterId: currentUser._id,
      reportedUserId: reportedUser._id,
      status: "open",
    });

    if (existingOpenReport) {
      return res.status(409).json({
        error: "DUPLICATE_REPORT",
        message: "You have already reported this user.",
      });
    }

    // Rate limit: max 10 reports per user per rolling 24h
    const MAX_DAILY_REPORTS =
      parseInt(process.env.RATE_LIMIT_REPORT_PER_DAY, 10) || 10;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const resetAt = currentUser.dailyReportCountResetAt
      ? new Date(currentUser.dailyReportCountResetAt).getTime()
      : 0;

    if (now - resetAt > ONE_DAY_MS) {
      currentUser.dailyReportCount = 0;
      currentUser.dailyReportCountResetAt = new Date(now);
    }

    if (currentUser.dailyReportCount >= MAX_DAILY_REPORTS) {
      return res.status(429).json({
        error: "RATE_LIMITED",
        message: "Daily report limit reached.",
      });
    }

    // Create report with status 'open'
    const report = await Report.create({
      reporterId: currentUser._id,
      reportedUserId: reportedUser._id,
      reason,
      details: details ? details.trim() : "",
      status: "open",
    });

    currentUser.dailyReportCount += 1;
    await currentUser.save();

    // Check auto-hide rule (TRD Section 7.2): count DISTINCT reporterIds among open reports
    const distinctReporters = await Report.distinct("reporterId", {
      reportedUserId: reportedUser._id,
      status: "open",
    });
    const openCount = distinctReporters.length;

    if (openCount >= Report.AUTO_HIDE_THRESHOLD) {
      if (reportedUser.status !== "hidden_pending_review" && reportedUser.status !== "banned") {
        reportedUser.status = "hidden_pending_review";
        await reportedUser.save();
        const suffix =
          openCount === 1 ? "1st" : openCount === 2 ? "2nd" : openCount === 3 ? "3rd" : `${openCount}th`;
        console.log(
          `[trust-safety] User ${reportedUser._id} auto-hidden after ${suffix} open report`
        );
      }
    }

    return res.status(201).json({
      message: "Report submitted successfully.",
      report,
    });
  } catch (err) {
    console.error("[trust-safety] POST /api/reports error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * GET /api/admin/reports?status=open
 * Protected by requireAdminKey.
 */
adminRouter.get("/reports", requireAdminKey, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const reports = await Report.find(filter)
      .populate("reporterId", "name authId city status")
      .populate("reportedUserId", "name authId city status")
      .sort({ createdAt: -1 });

    const formattedReports = reports.map((r) => ({
      id: r._id,
      _id: r._id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt,
      reporter: r.reporterId
        ? {
            id: r.reporterId._id,
            name: r.reporterId.name,
            city: r.reporterId.city,
          }
        : null,
      reportedUser: r.reportedUserId
        ? {
            id: r.reportedUserId._id,
            name: r.reportedUserId.name,
            city: r.reportedUserId.city,
            status: r.reportedUserId.status,
          }
        : null,
    }));

    return res.status(200).json({
      status: "ok",
      reports: formattedReports,
      count: formattedReports.length,
    });
  } catch (err) {
    console.error("[admin] GET /api/admin/reports error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

/**
 * PATCH /api/admin/reports/:id
 * Protected by requireAdminKey.
 * Body: { status, action }
 * status: 'reviewed_no_action' | 'actioned'
 * action: 'restore_user' | 'ban_user'
 */
adminRouter.patch("/reports/:id", requireAdminKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, action } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Invalid report ID format.",
      });
    }

    const ALLOWED_STATUSES = ["reviewed_no_action", "actioned"];
    if (status && !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
      });
    }

    const ALLOWED_ACTIONS = ["restore_user", "ban_user"];
    if (action && !ALLOWED_ACTIONS.includes(action)) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: `action must be one of: ${ALLOWED_ACTIONS.join(", ")}`,
      });
    }

    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Report not found.",
      });
    }

    let userStatusChanged = null;

    if (action === "restore_user") {
      const user = await User.findById(report.reportedUserId);
      if (user) {
        user.status = "active";
        await user.save();
        userStatusChanged = "active";
        console.log(`[admin] User ${user._id} restored to active status.`);
      }
      // Fix B: when admin restores a user, mark all open reports against that user as reviewed_no_action
      await Report.updateMany(
        { reportedUserId: report.reportedUserId, status: "open" },
        { $set: { status: "reviewed_no_action" } }
      );
      report.status = status || "reviewed_no_action";
    } else if (action === "ban_user") {
      const user = await User.findById(report.reportedUserId);
      if (user) {
        user.status = "banned";
        await user.save();
        userStatusChanged = "banned";
        console.log(`[admin] User ${user._id} banned.`);
      }
    }

    if (status) {
      report.status = status;
    }
    await report.save();

    return res.status(200).json({
      message: "Report updated successfully.",
      report,
      reportedUserStatus: userStatusChanged,
    });
  } catch (err) {
    console.error("[admin] PATCH /api/admin/reports/:id error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message,
    });
  }
});

module.exports = {
  reportsRouter,
  adminRouter,
  requireAdminKey,
};
