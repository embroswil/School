const db = require("../../config/db");


const createNotification = async (data) => {
  const { userId, title, message, type, priority, data: notificationData } = data;
  const query = `
    INSERT INTO notifications (user_id, title, message, type, priority, data)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const result = await db.query(query, [userId, title, message, type, priority || 'normal', JSON.stringify(notificationData || {})]);
  return result.rows[0];
};


const getUserNotifications = async (userId, page = 1, limit = 20, unreadOnly = false) => {
  const offset = (page - 1) * limit;
  let query = `SELECT * FROM notifications WHERE user_id = $1`;
  const params = [userId];
  
  if (unreadOnly) {
    query += ` AND is_read = false`;
  }
  
  query += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
  params.push(limit, offset);
  
  const result = await db.query(query, params);
  return result.rows;
};


const getNotificationById = async (id) => {
  const query = `SELECT * FROM notifications WHERE id = $1`;
  const result = await db.query(query, [id]);
  return result.rows[0];
};


const markAsRead = async (id, userId) => {
  const query = `
    UPDATE notifications
    SET is_read = true, read_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `;
  const result = await db.query(query, [id, userId]);
  return result.rows[0];
};


const markAllAsRead = async (userId) => {
  const query = `
    UPDATE notifications
    SET is_read = true, read_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND is_read = false
    RETURNING *
  `;
  const result = await db.query(query, [userId]);
  return result.rows;
};


const deleteNotification = async (id, userId) => {
  const query = `DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *`;
  const result = await db.query(query, [id, userId]);
  return result.rows[0];
};


const getUnreadCount = async (userId) => {
  const query = `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false`;
  const result = await db.query(query, [userId]);
  return parseInt(result.rows[0].count);
};


const getPreferences = async (userId) => {
  const query = `SELECT * FROM notification_preferences WHERE user_id = $1`;
  const result = await db.query(query, [userId]);
  return result.rows[0];
};


const updatePreferences = async (userId, updates) => {
  const { emailEnabled, smsEnabled, paymentAlerts, gradeAlerts, attendanceAlerts, announcementAlerts } = updates;
  const query = `
    INSERT INTO notification_preferences (
      user_id, email_enabled, sms_enabled, payment_alerts, grade_alerts, attendance_alerts, announcement_alerts
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id)
    DO UPDATE SET
      email_enabled = COALESCE($2, notification_preferences.email_enabled),
      sms_enabled = COALESCE($3, notification_preferences.sms_enabled),
      payment_alerts = COALESCE($4, notification_preferences.payment_alerts),
      grade_alerts = COALESCE($5, notification_preferences.grade_alerts),
      attendance_alerts = COALESCE($6, notification_preferences.attendance_alerts),
      announcement_alerts = COALESCE($7, notification_preferences.announcement_alerts),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  const result = await db.query(query, [
    userId, emailEnabled, smsEnabled, paymentAlerts, gradeAlerts, attendanceAlerts, announcementAlerts
  ]);
  return result.rows[0];
};

module.exports = {
  createNotification,
  getUserNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  getPreferences,
  updatePreferences,
};

