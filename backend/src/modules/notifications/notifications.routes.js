const express = require("express");
const router = express.Router();
const notificationsController = require("./notifications.controller");
const authMiddleware = require("../../middlewares/auth.middleware");


router.post("/", authMiddleware.authenticate, authMiddleware.authorize("admin"), notificationsController.createNotification);
router.post("/bulk", authMiddleware.authenticate, authMiddleware.authorize("admin"), notificationsController.sendBulkNotifications);


router.get("/", authMiddleware.authenticate, notificationsController.getUserNotifications);
router.get("/unread-count", authMiddleware.authenticate, notificationsController.getUnreadCount);
router.get("/:id", authMiddleware.authenticate, notificationsController.getNotificationById);
router.put("/:id/read", authMiddleware.authenticate, notificationsController.markAsRead);
router.put("/read-all", authMiddleware.authenticate, notificationsController.markAllAsRead);
router.delete("/:id", authMiddleware.authenticate, notificationsController.deleteNotification);


router.get("/preferences", authMiddleware.authenticate, notificationsController.getPreferences);
router.put("/preferences", authMiddleware.authenticate, notificationsController.updatePreferences);

module.exports = router;

