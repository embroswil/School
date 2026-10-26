const systemAdminSql = require('./system-admin.sql');
const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

class SystemAdminService {

  async getSystemSettings() {
    return await systemAdminSql.getSystemSettings();
  }

  async updateSystemSettings(settings, userId) {
    logger.info(`System settings updated by user ${userId}`);
    return await systemAdminSql.updateSystemSettings(settings, userId);
  }

  async createBackup(backupData = {}) {
    const backupRecord = {
      message: backupData.message || 'Manual backup created',
      type: backupData.type || 'manual',
      status: 'in_progress',
      createdBy: backupData.userId
    };
    
    logger.info(`Creating backup: ${backupRecord.message}`);
    return await systemAdminSql.createBackupRecord(backupRecord);
  }

  async getBackupHistory(limit = 10) {
    return await systemAdminSql.getBackupHistory(limit);
  }

  async enableMaintenanceMode(userId, reason = null) {
    logger.warn(`Maintenance mode enabled by user ${userId}: ${reason || 'No reason provided'}`);
    return await systemAdminSql.setMaintenanceMode(true, userId, reason);
  }

  async disableMaintenanceMode(userId) {
    logger.info(`Maintenance mode disabled by user ${userId}`);
    return await systemAdminSql.setMaintenanceMode(false, userId);
  }

  async getMaintenanceStatus() {
    return await systemAdminSql.getMaintenanceStatus();
  }

  async getSystemHealth() {
    const health = await systemAdminSql.getSystemHealth();
    
    if (health.database !== 'healthy') {
      health.status = 'unhealthy';
      health.message = 'Database connection failed';
    } else if (health.lastBackup) {
      const hoursSinceBackup = (Date.now() - new Date(health.lastBackup).getTime()) / (1000 * 60 * 60);
      if (hoursSinceBackup > 24) {
        health.status = 'warning';
        health.message = 'Last backup was more than 24 hours ago';
      } else {
        health.status = 'healthy';
        health.message = 'All systems operational';
      }
    } else {
      health.status = 'unknown';
      health.message = 'No backup information available';
    }

    return health;
  }

  async getDatabaseStats() {
    return await systemAdminSql.getDatabaseStats();
  }

  async getDeletedRecords(tableName, days = 30) {
    const validTables = ['users', 'classes', 'subjects', 'attendance', 'student_grades', 'payments'];
    
    if (!validTables.includes(tableName)) {
      throw new Error('Invalid table name');
    }
    
    return await systemAdminSql.getDeletedRecords(tableName, days);
  }

  async restoreRecord(tableName, id) {
    logger.info(`Restoring record ${id} from ${tableName}`);
    return await systemAdminSql.restoreRecord(tableName, id);
  }

  async permanentlyDeleteRecord(tableName, id) {
    logger.warn(`Permanently deleting record ${id} from ${tableName}`);
    return await systemAdminSql.permanentlyDeleteRecord(tableName, id);
  }

  async getSystemLogs(filters = {}) {
    return await systemAdminSql.getSystemLogs(filters);
  }

  async clearOldLogs(daysToKeep = 90) {
    const count = await systemAdminSql.clearOldLogs(daysToKeep);
    logger.info(`Cleared ${count} old system logs (keeping last ${daysToKeep} days)`);
    return { cleared: count, daysKept: daysToKeep };
  }

  async exportSystemConfig() {
    const config = {
      exportedAt: new Date().toISOString(),
      systemSettings: await this.getSystemSettings(),
      databaseStats: await this.getDatabaseStats(),
      backupHistory: await this.getBackupHistory(5)
    };
    return config;
  }

  async importSystemConfig(configData, userId) {
    if (configData.systemSettings) {
      await this.updateSystemSettings(configData.systemSettings, userId);
    }
    logger.info(`System configuration imported by user ${userId}`);
    return { success: true, message: 'Configuration imported successfully' };
  }
}

module.exports = new SystemAdminService();

