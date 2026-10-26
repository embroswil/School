const express = require('express');
const router = express.Router();
const systemAdminController = require('./system-admin.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

router.use(authenticate);
router.use(authorize('admin'));

router.get('/settings', systemAdminController.getSystemSettings);

router.put('/settings', systemAdminController.updateSystemSettings);

router.post('/backup', systemAdminController.createBackup);

router.get('/backup/history', systemAdminController.getBackupHistory);

router.post('/maintenance/enable', systemAdminController.enableMaintenanceMode);

router.post('/maintenance/disable', systemAdminController.disableMaintenanceMode);

router.get('/maintenance/status', systemAdminController.getMaintenanceStatus);

router.get('/health', systemAdminController.getSystemHealth);

router.get('/stats', systemAdminController.getDatabaseStats);

router.get('/deleted/:tableName', systemAdminController.getDeletedRecords);

router.post('/restore', systemAdminController.restoreRecord);

router.delete('/permanent', systemAdminController.permanentlyDeleteRecord);

router.get('/logs', systemAdminController.getSystemLogs);

router.post('/logs/clear', systemAdminController.clearOldLogs);

router.get('/config/export', systemAdminController.exportSystemConfig);

router.post('/config/import', systemAdminController.importSystemConfig);

module.exports = router;

