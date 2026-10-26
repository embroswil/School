const notificationsSql = require("./notifications.sql");
const ApiError = require("../../utils/ApiError");


const createNotification = async (data) => {
  const { userId, title, message, type, priority, data: notificationData } = data;
  
  if (!userId || !title || !message) {
    throw new ApiError(400, "User ID, title, and message are required");
  }
  
  return notificationsSql.createNotification({
    userId,
    title,
    message,
    type,
    priority,
    data: notificationData
  });
};


const sendBulkNotifications = async (userIds, data) => {
  const results = [];
  for (const userId of userIds) {
    const notification = await createNotification({ ...data, userId });
    results.push(notification);
  }
  return results;
};


const getUserNotifications = async (userId, page = 1, limit = 20, unreadOnly = false) => {
  return notificationsSql.getUserNotifications(userId, page, limit, unreadOnly);
};


const getNotificationById = async (id, userId) => {
  const notification = await notificationsSql.getNotificationById(id);
  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }
  
  
  if (notification.user_id !== userId) {
    throw new ApiError(403, "Not authorized to access this notification");
  }
  
  return notification;
};


const markAsRead = async (id, userId) => {
  const notification = await notificationsSql.getNotificationById(id);
  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }
  
  if (notification.user_id !== userId) {
    throw new ApiError(403, "Not authorized");
  }
  
  return notificationsSql.markAsRead(id, userId);
};


const markAllAsRead = async (userId) => {
  return notificationsSql.markAllAsRead(userId);
};


const deleteNotification = async (id, userId) => {
  const notification = await notificationsSql.getNotificationById(id);
  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }
  
  if (notification.user_id !== userId) {
    throw new ApiError(403, "Not authorized");
  }
  
  return notificationsSql.deleteNotification(id, userId);
};


const getUnreadCount = async (userId) => {
  return notificationsSql.getUnreadCount(userId);
};


const getPreferences = async (userId) => {
  let prefs = await notificationsSql.getPreferences(userId);
  
  if (!prefs) {
    prefs = await notificationsSql.updatePreferences(userId, {});
  }
  
  return prefs;
};

const updatePreferences = async (userId, updates) => {
  return notificationsSql.updatePreferences(userId, updates);
};


const notifyPayment = async (studentId, parentId, amount, status) => {
  const title = status === 'completed' ? 'Payment Received' : 'Payment Update';
  const message = status === 'completed' 
    ? `Payment of KES ${amount} has been received successfully.`
    : `Your payment of KES ${amount} is ${status}.`;
  
  return createNotification({
    userId: parentId,
    title,
    message,
    type: 'payment',
    priority: 'normal',
    data: { studentId, amount, status }
  });
};

const notifyGradePublished = async (studentId, parentId, subjectName, termName) => {
  return createNotification({
    userId: parentId,
    title: 'Grade Published',
    message: `Grades for ${subjectName} in ${termName} have been published.`,
    type: 'grade',
    priority: 'normal',
    data: { studentId, subjectName, termName }
  });
};

const notifyAttendanceAlert = async (parentId, studentId, date, status) => {
  return createNotification({
    userId: parentId,
    title: 'Attendance Alert',
    message: `Your child was marked ${status} on ${new Date(date).toLocaleDateString()}.`,
    type: 'attendance',
    priority: status === 'absent' ? 'high' : 'normal',
    data: { studentId, date, status }
  });
};

const notifyAnnouncement = async (userIds, title, message) => {
  return sendBulkNotifications(userIds, {
    title,
    message,
    type: 'announcement',
    priority: 'normal'
  });
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
  notifyPayment,
  notifyGradePublished,
  notifyAttendanceAlert,
  notifyAnnouncement,
};

