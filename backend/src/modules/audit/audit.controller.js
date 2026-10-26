const auditService = require("./audit.service");


const getAuditLogs = async (req, res, next) => {
  try {
    const { userId, action, entityType, entityId, startDate, endDate, page = 1, limit = 50 } = req.query;

    const logs = await auditService.getAuditLogs(
      { userId, action, entityType, entityId, startDate, endDate },
      parseInt(page),
      parseInt(limit)
    );

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    next(error);
  }
};


const getAuditLogById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const log = await auditService.getAuditLogById(parseInt(id));

    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    next(error);
  }
};


const getEntityAuditTrail = async (req, res, next) => {
  try {
    const { entityType, entityId } = req.params;

    const logs = await auditService.getEntityAuditTrail(entityType, parseInt(entityId));

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    next(error);
  }
};


const getSystemEvents = async (req, res, next) => {
  try {
    const { eventType, severity, startDate, endDate, page = 1, limit = 50 } = req.query;

    const events = await auditService.getSystemEvents(
      { eventType, severity, startDate, endDate },
      parseInt(page),
      parseInt(limit)
    );

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAuditLogs,
  getAuditLogById,
  getEntityAuditTrail,
  getSystemEvents,
};

