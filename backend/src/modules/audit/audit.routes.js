const express = require("express");
const router = express.Router();
const auditController = require("./audit.controller");
const authMiddleware = require("../../middlewares/auth.middleware");


router.use(authMiddleware.authenticate);
router.use(authMiddleware.authorize("admin"));


router.get("/logs", auditController.getAuditLogs);
router.get("/logs/entity/:entityType/:entityId", auditController.getEntityAuditTrail);
router.get("/logs/:id", auditController.getAuditLogById);


router.get("/events", auditController.getSystemEvents);

module.exports = router;

