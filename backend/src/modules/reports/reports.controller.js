const reportsService = require('./reports.service');
const logger = require('../../utils/logger');

class ReportsController {

  async getDailyAttendanceReport(req, res) {
    try {
      const { date, classId, academicYearId } = req.query;
      
      if (!date) {
        return res.status(400).json({
          success: false,
          message: 'Date is required'
        });
      }

      const report = await reportsService.getDailyAttendanceReport(
        date,
        classId ? parseInt(classId) : null,
        academicYearId ? parseInt(academicYearId) : null
      );

      res.status(200).json({
        success: true,
        data: report,
        meta: {
          totalRecords: report.length,
          date,
          classId: classId || 'all',
          academicYearId: academicYearId || 'current'
        }
      });
    } catch (error) {
      logger.error('Error generating daily attendance report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate attendance report',
        error: error.message
      });
    }
  }

  async getAttendanceSummaryByClass(req, res) {
    try {
      const { classId, academicYearId, termId, startDate, endDate } = req.query;
      
      if (!classId) {
        return res.status(400).json({
          success: false,
          message: 'Class ID is required'
        });
      }

      const report = await reportsService.getAttendanceSummaryByClass(
        parseInt(classId),
        academicYearId ? parseInt(academicYearId) : null,
        termId ? parseInt(termId) : null,
        startDate || null,
        endDate || null
      );

      res.status(200).json({
        success: true,
        data: report,
        meta: {
          totalStudents: report.length,
          filters: { academicYearId, termId, startDate, endDate }
        }
      });
    } catch (error) {
      logger.error('Error generating attendance summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate attendance summary',
        error: error.message
      });
    }
  }

  async getAttendanceTrendReport(req, res) {
    try {
      const { academicYearId, termId, classId, startDate, endDate } = req.query;

      const report = await reportsService.getAttendanceTrendReport(
        academicYearId ? parseInt(academicYearId) : null,
        termId ? parseInt(termId) : null,
        classId ? parseInt(classId) : null,
        startDate || null,
        endDate || null
      );

      res.status(200).json({
        success: true,
        data: report,
        meta: {
          totalDays: report.length,
          filters: { academicYearId, termId, classId, startDate, endDate }
        }
      });
    } catch (error) {
      logger.error('Error generating attendance trend report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate attendance trend report',
        error: error.message
      });
    }
  }

  async getGradeSummaryByClass(req, res) {
    try {
      const { classId, academicYearId, termId, subjectId } = req.query;
      
      if (!classId) {
        return res.status(400).json({
          success: false,
          message: 'Class ID is required'
        });
      }

      const report = await reportsService.getGradeSummaryByClass(
        parseInt(classId),
        academicYearId ? parseInt(academicYearId) : null,
        termId ? parseInt(termId) : null,
        subjectId ? parseInt(subjectId) : null
      );

      res.status(200).json({
        success: true,
        data: report,
        meta: {
          totalStudents: report.length,
          filters: { academicYearId, termId, subjectId }
        }
      });
    } catch (error) {
      logger.error('Error generating grade summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate grade summary',
        error: error.message
      });
    }
  }

  async getSubjectPerformanceReport(req, res) {
    try {
      const { subjectId, academicYearId, termId, classId } = req.query;
      
      if (!subjectId) {
        return res.status(400).json({
          success: false,
          message: 'Subject ID is required'
        });
      }

      const report = await reportsService.getSubjectPerformanceReport(
        parseInt(subjectId),
        academicYearId ? parseInt(academicYearId) : null,
        termId ? parseInt(termId) : null,
        classId ? parseInt(classId) : null
      );

      res.status(200).json({
        success: true,
        data: report,
        meta: {
          totalRecords: report.length,
          filters: { academicYearId, termId, classId }
        }
      });
    } catch (error) {
      logger.error('Error generating subject performance report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate subject performance report',
        error: error.message
      });
    }
  }

  async getStudentProgressReport(req, res) {
    try {
      const { studentId, academicYearId } = req.query;
      
      if (!studentId) {
        return res.status(400).json({
          success: false,
          message: 'Student ID is required'
        });
      }

      const report = await reportsService.getStudentProgressReport(
        parseInt(studentId),
        academicYearId ? parseInt(academicYearId) : null
      );

      res.status(200).json({
        success: true,
        data: report,
        meta: {
          totalSubjects: report.length,
          academicYearId
        }
      });
    } catch (error) {
      logger.error('Error generating student progress report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate student progress report',
        error: error.message
      });
    }
  }

  async getFeeCollectionSummary(req, res) {
    try {
      const { academicYearId, termId, classId, startDate, endDate } = req.query;

      const report = await reportsService.getFeeCollectionSummary(
        academicYearId ? parseInt(academicYearId) : null,
        termId ? parseInt(termId) : null,
        classId ? parseInt(classId) : null,
        startDate || null,
        endDate || null
      );

      const totals = report.reduce((acc, item) => {
        acc.totalExpected += parseFloat(item.total_expected) || 0;
        acc.totalCollected += parseFloat(item.total_collected) || 0;
        acc.totalBalance += parseFloat(item.total_balance) || 0;
        return acc;
      }, { totalExpected: 0, totalCollected: 0, totalBalance: 0 });

      res.status(200).json({
        success: true,
        data: report,
        totals,
        meta: {
          filters: { academicYearId, termId, classId, startDate, endDate }
        }
      });
    } catch (error) {
      logger.error('Error generating fee collection summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate fee collection summary',
        error: error.message
      });
    }
  }

  async getPaymentHistoryReport(req, res) {
    try {
      const { academicYearId, classId, studentId, startDate, endDate, status } = req.query;

      const report = await reportsService.getPaymentHistoryReport(
        academicYearId ? parseInt(academicYearId) : null,
        classId ? parseInt(classId) : null,
        studentId ? parseInt(studentId) : null,
        startDate || null,
        endDate || null,
        status || null
      );

      const totalAmount = report.reduce((sum, p) => sum + parseFloat(p.payment_amount), 0);

      res.status(200).json({
        success: true,
        data: report,
        totalAmount,
        meta: {
          totalPayments: report.length,
          filters: { academicYearId, classId, studentId, startDate, endDate, status }
        }
      });
    } catch (error) {
      logger.error('Error generating payment history report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate payment history report',
        error: error.message
      });
    }
  }

  async getOutstandingFeesReport(req, res) {
    try {
      const { academicYearId, classId } = req.query;

      const report = await reportsService.getOutstandingFeesReport(
        academicYearId ? parseInt(academicYearId) : null,
        classId ? parseInt(classId) : null
      );

      const totalOutstanding = report.reduce((sum, s) => sum + parseFloat(s.total_balance), 0);

      res.status(200).json({
        success: true,
        data: report,
        totalOutstanding,
        meta: {
          totalStudents: report.length,
          filters: { academicYearId, classId }
        }
      });
    } catch (error) {
      logger.error('Error generating outstanding fees report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate outstanding fees report',
        error: error.message
      });
    }
  }

  async getTeacherWorkloadReport(req, res) {
    try {
      const { academicYearId } = req.query;

      const report = await reportsService.getTeacherWorkloadReport(
        academicYearId ? parseInt(academicYearId) : null
      );

      res.status(200).json({
        success: true,
        data: report,
        meta: {
          totalTeachers: report.length,
          academicYearId
        }
      });
    } catch (error) {
      logger.error('Error generating teacher workload report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate teacher workload report',
        error: error.message
      });
    }
  }

  async getTeacherSubjectAssignment(req, res) {
    try {
      const { academicYearId } = req.query;

      const report = await reportsService.getTeacherSubjectAssignment(
        academicYearId ? parseInt(academicYearId) : null
      );

      res.status(200).json({
        success: true,
        data: report,
        meta: {
          totalAssignments: report.length,
          academicYearId
        }
      });
    } catch (error) {
      logger.error('Error generating teacher subject assignment report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate teacher subject assignment report',
        error: error.message
      });
    }
  }

  async getOverallSchoolStatistics(req, res) {
    try {
      const { academicYearId } = req.query;

      const statistics = await reportsService.getOverallSchoolStatistics(
        academicYearId ? parseInt(academicYearId) : null
      );

      res.status(200).json({
        success: true,
        data: statistics
      });
    } catch (error) {
      logger.error('Error generating school statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate school statistics',
        error: error.message
      });
    }
  }

  async getDashboardSummary(req, res) {
    try {
      const { academicYearId } = req.query;

      const summary = await reportsService.getDashboardSummary(
        academicYearId ? parseInt(academicYearId) : null
      );

      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      logger.error('Error generating dashboard summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate dashboard summary',
        error: error.message
      });
    }
  }

  async exportReportToCSV(req, res) {
    try {
      const { reportType, format, ...filters } = req.query;

      let data;
      let headers;

      switch (reportType) {
        case 'attendance':
          data = await reportsService.getDailyAttendanceReport(filters.date, filters.classId, filters.academicYearId);
          headers = ['Student Name', 'Class', 'Date', 'Status', 'Remarks'];
          break;
        case 'attendance_summary':
          data = await reportsService.getAttendanceSummaryByClass(filters.classId, filters.academicYearId, filters.termId);
          headers = ['Student Name', 'Total Days', 'Present', 'Absent', 'Late', 'Percentage', 'Grade'];
          break;
        case 'grades':
          data = await reportsService.getGradeSummaryByClass(filters.classId, filters.academicYearId, filters.termId, filters.subjectId);
          headers = ['Student Name', 'Subject', 'Average %', 'Highest', 'Lowest', 'Grade'];
          break;
        case 'fees':
          data = await reportsService.getFeeCollectionSummary(filters.academicYearId, filters.termId, filters.classId);
          headers = ['Fee Name', 'Class', 'Total Expected', 'Collected', 'Balance', 'Collection %'];
          break;
        case 'payments':
          data = await reportsService.getPaymentHistoryReport(filters.academicYearId, filters.classId, filters.studentId, filters.startDate, filters.endDate);
          headers = ['Student Name', 'Amount', 'Date', 'Method', 'Transaction ID', 'Receipt'];
          break;
        case 'outstanding_fees':
          data = await reportsService.getOutstandingFeesReport(filters.academicYearId, filters.classId);
          headers = ['Student Name', 'Class', 'Total Fee', 'Paid', 'Balance'];
          break;
        case 'teacher_workload':
          data = await reportsService.getTeacherWorkloadReport(filters.academicYearId);
          headers = ['Teacher Name', 'Classes', 'Subjects', 'Timetable Entries', 'Attendance Marked', 'Grades Entered'];
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid report type'
          });
      }

      const csv = reportsService.convertToCSV(data, headers);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${reportType}_report_${Date.now()}.csv`);
      res.send(csv);
    } catch (error) {
      logger.error('Error exporting report to CSV:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export report',
        error: error.message
      });
    }
  }
}

module.exports = new ReportsController();

