const db = require("../../config/db");


const createAuditLog = async (data) => {
  const { userId, action, entityType, entityId, oldData, newData, ipAddress, userAgent } = data;
  
  const query = `
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_data, new_data, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
  const result = await db.query(query, [
    userId, action, entityType, entityId, 
    oldData ? JSON.stringify(oldData) : null,
    newData ? JSON.stringify(newData) : null,
    ipAddress, userAgent
  ]);
  return result.rows[0];
};


const getAuditLogs = async (filters = {}, page = 1, limit = 50) => {
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT al.*, u.email as user_email, u.first_name, u.last_name
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  
  if (filters.userId) {
    query += ` AND al.user_id = $${params.length + 1}`;
    params.push(filters.userId);
  }
  
  if (filters.action) {
    query += ` AND al.action = $${params.length + 1}`;
    params.push(filters.action);
  }
  
  if (filters.entityType) {
    query += ` AND al.entity_type = $${params.length + 1}`;
    params.push(filters.entityType);
  }
  
  if (filters.entityId) {
    query += ` AND al.entity_id = $${params.length + 1}`;
    params.push(filters.entityId);
  }
  
  if (filters.startDate) {
    query += ` AND al.created_at >= $${params.length + 1}`;
    params.push(filters.startDate);
  }
  
  if (filters.endDate) {
    query += ` AND al.created_at <= $${params.length + 1}`;
    params.push(filters.endDate);
  }
  
  query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  const result = await db.query(query, params);
  return result.rows;
};


const getAuditLogById = async (id) => {
  const query = `
    SELECT al.*, u.email as user_email, u.first_name, u.last_name
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE al.id = $1
  `;
  const result = await db.query(query, [id]);
  return result.rows[0];
};


const getEntityAuditLogs = async (entityType, entityId) => {
  const query = `
    SELECT al.*, u.email as user_email, u.first_name, u.last_name
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE al.entity_type = $1 AND al.entity_id = $2
    ORDER BY al.created_at DESC
  `;
  const result = await db.query(query, [entityType, entityId]);
  return result.rows;
};


const createSystemEvent = async (data) => {
  const { eventType, severity, message, details, ipAddress } = data;
  
  const query = `
    INSERT INTO system_events (event_type, severity, message, details, ip_address)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const result = await db.query(query, [eventType, severity || 'info', message, details ? JSON.stringify(details) : null, ipAddress]);
  return result.rows[0];
};

const getSystemEvents = async (filters = {}, page = 1, limit = 50) => {
  const offset = (page - 1) * limit;
  
  let query = `SELECT * FROM system_events WHERE 1=1`;
  const params = [];
  
  if (filters.eventType) {
    query += ` AND event_type = $${params.length + 1}`;
    params.push(filters.eventType);
  }
  
  if (filters.severity) {
    query += ` AND severity = $${params.length + 1}`;
    params.push(filters.severity);
  }
  
  if (filters.startDate) {
    query += ` AND created_at >= $${params.length + 1}`;
    params.push(filters.startDate);
  }
  
  if (filters.endDate) {
    query += ` AND created_at <= $${params.length + 1}`;
    params.push(filters.endDate);
  }
  
  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  const result = await db.query(query, params);
  return result.rows;
};

module.exports = {
  createAuditLog,
  getAuditLogs,
  getAuditLogById,
  getEntityAuditLogs,
  createSystemEvent,
  getSystemEvents,
};

