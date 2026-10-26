const notificationsService = require("./notifications.service");


const createNotification = async (req, res, next) => {
  try {
    const { userId, title, message, type, priority, data } = req.body;
    
    const notification = await notificationsService.createNotification({
      userId: parseInt(userId),
      title,
      message,
      type,
      priority,
      data
    });

    res.status(201).json({
      success: true,
      message: "Notification created successfully",
      data: notification
    });
  } catch (error) {
    next(error);
  }
};


const sendBulkNotifications = async (req, res, next) => {
  try {
    const { userIds, title, message, type, priority } = req.body;
    
    const notifications = await notificationsService.sendBulkNotifications(
      userIds.map(id => parseInt(id)),
      { title, message, type, priority }
    );

    res.status(201).json({
      success: true,
      message: `${notifications.length} notifications sent`,
      data: notifications
    });
  } catch (error) {
    next(error);
  }
};


const getUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const notifications = await notificationsService.getUserNotifications(
      userId,
      parseInt(page),
      parseInt(limit),
      unreadOnly === "true"
    );

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    next(error);
  }
};


const getNotificationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const notification = await notificationsService.getNotificationById(parseInt(id), userId);

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    next(error);
  }
};


const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const notification = await notificationsService.markAsRead(parseInt(id), userId);

    res.json({
      success: true,
      message: "Notification marked as read",
      data: notification
    });
  } catch (error) {
    next(error);
  }
};


const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const notifications = await notificationsService.markAllAsRead(userId);

    res.json({
      success: true,
      message: `${notifications.length} notifications marked as read`,
      data: notifications
    });
  } catch (error) {
    next(error);
  }
};


const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    await notificationsService.deleteNotification(parseInt(id), userId);

    res.json({
      success: true,
      message: "Notification deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};


const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const count = await notificationsService.getUnreadCount(userId);

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    next(error);
  }
};


const getPreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const prefs = await notificationsService.getPreferences(userId);

    res.json({
      success: true,
      data: prefs
    });
  } catch (error) {
    next(error);
  }
};


const updatePreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { emailEnabled, smsEnabled, paymentAlerts, gradeAlerts, attendanceAlerts, announcementAlerts } = req.body;
    
    const prefs = await notificationsService.updatePreferences(userId, {
      emailEnabled,
      smsEnabled,
      paymentAlerts,
      gradeAlerts,
      attendanceAlerts,
      announcementAlerts
    });

    res.json({
      success: true,
      message: "Preferences updated successfully",
      data: prefs
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createNotification,
  sendBulkNotifications,
  getUserNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  getPreferences,
  updatePreferences,
};

