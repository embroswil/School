const express = require('express');
const router = express.Router();
const reportsController = require('./reports.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

router.use(authenticate);
router.use(authorize('admin', 'teacher'));

router.get('/attendance/daily', reportsController.getDailyAttendanceReport);

router.get('/attendance/summary', reportsController.getAttendanceSummaryByClass);

router.get('/attendance/trend', reportsController.getAttendanceTrendReport);

router.get('/grades/class', reportsController.getGradeSummaryByClass);

router.get('/grades/subject', reportsController.getSubjectPerformanceReport);

router.get('/grades/student', reportsController.getStudentProgressReport);

router.get('/fees/summary', reportsController.getFeeCollectionSummary);

router.get('/fees/payments', reportsController.getPaymentHistoryReport);

router.get('/fees/outstanding', reportsController.getOutstandingFeesReport);

router.get('/teachers/workload', reportsController.getTeacherWorkloadReport);

router.get('/teachers/subjects', reportsController.getTeacherSubjectAssignment);

router.get('/statistics', reportsController.getOverallSchoolStatistics);

router.get('/dashboard', reportsController.getDashboardSummary);

router.get('/export', reportsController.exportReportToCSV);

module.exports = router;

