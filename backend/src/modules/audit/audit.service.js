const auditSql = require("./audit.sql");


const logAudit = async (data) => {
  const { userId, action, entityType, entityId, oldData, newData, ipAddress, userAgent } = data;
  
  return auditSql.createAuditLog({
    userId,
    action,
    entityType,
    entityId,
    oldData,
    newData,
    ipAddress,
    userAgent
  });
};


const getAuditLogs = async (filters = {}, page = 1, limit = 50) => {
  return auditSql.getAuditLogs(filters, page, limit);
};


const getAuditLogById = async (id) => {
  return auditSql.getAuditLogById(id);
};


const getEntityAuditTrail = async (entityType, entityId) => {
  return auditSql.getEntityAuditLogs(entityType, entityId);
};


const logSystemEvent = async (data) => {
  const { eventType, severity, message, details, ipAddress } = data;
  
  return auditSql.createSystemEvent({
    eventType,
    severity,
    message,
    details,
    ipAddress
  });
};

const getSystemEvents = async (filters = {}, page = 1, limit = 50) => {
  return auditSql.getSystemEvents(filters, page, limit);
};


const auditMiddleware = (action, entityType) => {
  return async (req, res, next) => {
    
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
      
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const entityId = req.params.id || (data && data.data && data.data.id);
        
        logAudit({
          userId: req.user.id,
          action,
          entityType,
          entityId,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }).catch(console.error);
      }
      
      return originalJson(data);
    };
    
    next();
  };
};

module.exports = {
  logAudit,
  getAuditLogs,
  getAuditLogById,
  getEntityAuditTrail,
  logSystemEvent,
  getSystemEvents,
  auditMiddleware,
};

