const db = require("../../config/db");

const getSystemSettings = async () => {
  const query = `
    SELECT * FROM system_events 
    WHERE event_type = 'settings' 
    ORDER BY created_at DESC 
    LIMIT 1
  `;
  const result = await db.query(query);
  return result.rows[0];
};

const updateSystemSettings = async (settings, userId) => {
  const query = `
    INSERT INTO system_events (event_type, severity, message, details, created_at)
    VALUES ('settings', 'info', 'System settings updated', $1, CURRENT_TIMESTAMP)
    RETURNING id, event_type, severity, message, details, created_at
  `;
  const result = await db.query(query, [JSON.stringify(settings)]);
  return result.rows[0];
};

const createBackupRecord = async (backupData) => {
  const query = `
    INSERT INTO system_events (event_type, severity, message, details, created_at)
    VALUES ('backup', 'info', $1, $2, CURRENT_TIMESTAMP)
    RETURNING id, event_type, severity, message, details, created_at
  `;
  const result = await db.query(query, [
    backupData.message || 'Backup created',
    JSON.stringify(backupData)
  ]);
  return result.rows[0];
};

const getBackupHistory = async (limit = 10) => {
  const query = `
    SELECT * FROM system_events 
    WHERE event_type = 'backup' 
    ORDER BY created_at DESC 
    LIMIT $1
  `;
  const result = await db.query(query, [limit]);
  return result.rows;
};

const setMaintenanceMode = async (enabled, userId, reason = null) => {
  const status = enabled ? 'maintenance_enabled' : 'maintenance_disabled';
  const message = enabled 
    ? `Maintenance mode enabled${reason ? ': ' + reason : ''}` 
    : 'Maintenance mode disabled';
  
  const query = `
    INSERT INTO system_events (event_type, severity, message, details, created_at)
    VALUES ($1, 'warning', $2, $3, CURRENT_TIMESTAMP)
    RETURNING id, event_type, severity, message, details, created_at
  `;
  const result = await db.query(query, [
    status,
    message,
    JSON.stringify({ enabled, reason, user_id: userId })
  ]);
  return result.rows[0];
};

const getMaintenanceStatus = async () => {
  const query = `
    SELECT * FROM system_events 
    WHERE event_type IN ('maintenance_enabled', 'maintenance_disabled')
    ORDER BY created_at DESC 
    LIMIT 1
  `;
  const result = await db.query(query);
  return result.rows[0];
};

const getSystemHealth = async () => {
  const health = {
    database: 'unknown',
    lastBackup: null,
    activeUsers: 0,
    systemEvents: 0
  };

  try {
    await db.query('SELECT 1');
    health.database = 'healthy';
  } catch (error) {
    health.database = 'unhealthy';
    health.databaseError = error.message;
  }

  const backupQuery = `
    SELECT created_at FROM system_events 
    WHERE event_type = 'backup' 
    ORDER BY created_at DESC 
    LIMIT 1
  `;
  const backupResult = await db.query(backupQuery);
  if (backupResult.rows.length > 0) {
    health.lastBackup = backupResult.rows[0].created_at;
  }

  const usersQuery = `
    SELECT COUNT(DISTINCT user_id) as count FROM sessions 
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `;
  const usersResult = await db.query(usersQuery);
  health.activeUsers = parseInt(usersResult.rows[0].count);

  const eventsQuery = `
    SELECT COUNT(*) as count FROM system_events 
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `;
  const eventsResult = await db.query(eventsQuery);
  health.systemEvents = parseInt(eventsResult.rows[0].count);

  return health;
};

const getDatabaseStats = async () => {
  const stats = {};

  const tables = [
    'users', 'classes', 'subjects', 'attendance', 
    'student_grades', 'payments', 'notifications', 'audit_logs'
  ];

  for (const table of tables) {
    try {
      const query = `SELECT COUNT(*) as count FROM ${table}`;
      const result = await db.query(query);
      stats[table] = parseInt(result.rows[0].count);
    } catch (error) {
      stats[table] = 0;
    }
  }

  return stats;
};

const getDeletedRecords = async (tableName, days = 30) => {
  const columnQuery = `
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = $1 AND column_name = 'deleted_at'
  `;
  const columnResult = await db.query(columnQuery, [tableName]);
  
  if (columnResult.rows.length === 0) {
    return [];
  }

  const query = `
    SELECT * FROM ${tableName} 
    WHERE deleted_at IS NOT NULL 
    AND deleted_at > NOW() - INTERVAL '${days} days'
    ORDER BY deleted_at DESC
  `;
  const result = await db.query(query);
  return result.rows;
};

const restoreRecord = async (tableName, id) => {
  const query = `
    UPDATE ${tableName} 
    SET deleted_at = NULL 
    WHERE id = $1
    RETURNING id, deleted_at
  `;
  const result = await db.query(query, [id]);
  return result.rows[0];
};

const permanentlyDeleteRecord = async (tableName, id) => {
  const query = `
    DELETE FROM ${tableName} 
    WHERE id = $1
    RETURNING id
  `;
  const result = await db.query(query, [id]);
  return result.rows[0];
};

const getSystemLogs = async (filters = {}) => {
  let query = `
    SELECT * FROM system_events 
    WHERE 1=1
  `;
  const values = [];

  if (filters.eventType) {
    values.push(filters.eventType);
    query += ` AND event_type = $${values.length}`;
  }

  if (filters.severity) {
    values.push(filters.severity);
    query += ` AND severity = $${values.length}`;
  }

  if (filters.startDate) {
    values.push(filters.startDate);
    query += ` AND created_at >= $${values.length}`;
  }

  if (filters.endDate) {
    values.push(filters.endDate);
    query += ` AND created_at <= $${values.length}`;
  }

  query += ` ORDER BY created_at DESC`;

  if (filters.limit) {
    values.push(filters.limit);
    query += ` LIMIT $${values.length}`;
  } else {
    values.push(100);
    query += ` LIMIT $${values.length}`;
  }

  const result = await db.query(query, values);
  return result.rows;
};

const clearOldLogs = async (daysToKeep = 90) => {
  const query = `
    DELETE FROM system_events 
    WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
    RETURNING id
  `;
  const result = await db.query(query);
  return result.rows.length;
};

module.exports = {
  getSystemSettings,
  updateSystemSettings,
  createBackupRecord,
  getBackupHistory,
  setMaintenanceMode,
  getMaintenanceStatus,
  getSystemHealth,
  getDatabaseStats,
  getDeletedRecords,
  restoreRecord,
  permanentlyDeleteRecord,
  getSystemLogs,
  clearOldLogs
};

