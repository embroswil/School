const systemAdminService = require('./system-admin.service');
const logger = require('../../utils/logger');

class SystemAdminController {

  async getSystemSettings(req, res) {
    try {
      const settings = await systemAdminService.getSystemSettings();
      res.status(200).json({
        success: true,
        data: settings
      });
    } catch (error) {
      logger.error('Error getting system settings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get system settings',
        error: error.message
      });
    }
  }

  async updateSystemSettings(req, res) {
    try {
      const { settings } = req.body;
      const updated = await systemAdminService.updateSystemSettings(settings, req.user.id);
      res.status(200).json({
        success: true,
        message: 'System settings updated successfully',
        data: updated
      });
    } catch (error) {
      logger.error('Error updating system settings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update system settings',
        error: error.message
      });
    }
  }

  async createBackup(req, res) {
    try {
      const { message, type } = req.body;
      const backup = await systemAdminService.createBackup({
        message,
        type,
        userId: req.user.id
      });
      res.status(201).json({
        success: true,
        message: 'Backup created successfully',
        data: backup
      });
    } catch (error) {
      logger.error('Error creating backup:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create backup',
        error: error.message
      });
    }
  }

  async getBackupHistory(req, res) {
    try {
      const { limit } = req.query;
      const history = await systemAdminService.getBackupHistory(limit ? parseInt(limit) : 10);
      res.status(200).json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Error getting backup history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get backup history',
        error: error.message
      });
    }
  }

  async enableMaintenanceMode(req, res) {
    try {
      const { reason } = req.body;
      const result = await systemAdminService.enableMaintenanceMode(req.user.id, reason);
      res.status(200).json({
        success: true,
        message: 'Maintenance mode enabled',
        data: result
      });
    } catch (error) {
      logger.error('Error enabling maintenance mode:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to enable maintenance mode',
        error: error.message
      });
    }
  }

  async disableMaintenanceMode(req, res) {
    try {
      const result = await systemAdminService.disableMaintenanceMode(req.user.id);
      res.status(200).json({
        success: true,
        message: 'Maintenance mode disabled',
        data: result
      });
    } catch (error) {
      logger.error('Error disabling maintenance mode:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to disable maintenance mode',
        error: error.message
      });
    }
  }

  async getMaintenanceStatus(req, res) {
    try {
      const status = await systemAdminService.getMaintenanceStatus();
      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Error getting maintenance status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get maintenance status',
        error: error.message
      });
    }
  }

  async getSystemHealth(req, res) {
    try {
      const health = await systemAdminService.getSystemHealth();
      res.status(200).json({
        success: true,
        data: health
      });
    } catch (error) {
      logger.error('Error getting system health:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get system health',
        error: error.message
      });
    }
  }

  async getDatabaseStats(req, res) {
    try {
      const stats = await systemAdminService.getDatabaseStats();
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error getting database stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get database stats',
        error: error.message
      });
    }
  }

  async getDeletedRecords(req, res) {
    try {
      const { tableName, days } = req.query;
      
      if (!tableName) {
        return res.status(400).json({
          success: false,
          message: 'Table name is required'
        });
      }

      const records = await systemAdminService.getDeletedRecords(
        tableName,
        days ? parseInt(days) : 30
      );
      
      res.status(200).json({
        success: true,
        data: records
      });
    } catch (error) {
      logger.error('Error getting deleted records:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get deleted records',
        error: error.message
      });
    }
  }

  async restoreRecord(req, res) {
    try {
      const { tableName, id } = req.body;
      
      if (!tableName || !id) {
        return res.status(400).json({
          success: false,
          message: 'Table name and ID are required'
        });
      }

      const result = await systemAdminService.restoreRecord(tableName, id);
      res.status(200).json({
        success: true,
        message: 'Record restored successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error restoring record:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restore record',
        error: error.message
      });
    }
  }

  async permanentlyDeleteRecord(req, res) {
    try {
      const { tableName, id } = req.body;
      
      if (!tableName || !id) {
        return res.status(400).json({
          success: false,
          message: 'Table name and ID are required'
        });
      }

      const result = await systemAdminService.permanentlyDeleteRecord(tableName, id);
      res.status(200).json({
        success: true,
        message: 'Record permanently deleted',
        data: result
      });
    } catch (error) {
      logger.error('Error permanently deleting record:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to permanently delete record',
        error: error.message
      });
    }
  }

  async getSystemLogs(req, res) {
    try {
      const { eventType, severity, startDate, endDate, limit } = req.query;
      
      const logs = await systemAdminService.getSystemLogs({
        eventType,
        severity,
        startDate,
        endDate,
        limit: limit ? parseInt(limit) : 100
      });
      
      res.status(200).json({
        success: true,
        data: logs
      });
    } catch (error) {
      logger.error('Error getting system logs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get system logs',
        error: error.message
      });
    }
  }

  async clearOldLogs(req, res) {
    try {
      const { daysToKeep } = req.body;
      
      const result = await systemAdminService.clearOldLogs(daysToKeep || 90);
      res.status(200).json({
        success: true,
        message: `Cleared ${result.cleared} old logs`,
        data: result
      });
    } catch (error) {
      logger.error('Error clearing old logs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear old logs',
        error: error.message
      });
    }
  }

  async exportSystemConfig(req, res) {
    try {
      const config = await systemAdminService.exportSystemConfig();
      res.status(200).json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error('Error exporting system config:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export system config',
        error: error.message
      });
    }
  }

  async importSystemConfig(req, res) {
    try {
      const { config } = req.body;
      const result = await systemAdminService.importSystemConfig(config, req.user.id);
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Error importing system config:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to import system config',
        error: error.message
      });
    }
  }
}

module.exports = new SystemAdminController();

