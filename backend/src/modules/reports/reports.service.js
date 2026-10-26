const reportsSql = require('./reports.sql');

class ReportsService {

  async getDailyAttendanceReport(date, classId = null, academicYearId = null) {
    return await reportsSql.getDailyAttendanceReport(date, classId, academicYearId);
  }

  async getAttendanceSummaryByClass(classId, academicYearId = null, termId = null, startDate = null, endDate = null) {
    return await reportsSql.getAttendanceSummaryByClass(classId, academicYearId, termId, startDate, endDate);
  }

  async getAttendanceTrendReport(academicYearId = null, termId = null, classId = null, startDate = null, endDate = null) {
    return await reportsSql.getAttendanceTrendReport(academicYearId, termId, classId, startDate, endDate);
  }

  async getGradeSummaryByClass(classId, academicYearId = null, termId = null, subjectId = null) {
    return await reportsSql.getGradeSummaryByClass(classId, academicYearId, termId, subjectId);
  }

  async getSubjectPerformanceReport(subjectId, academicYearId = null, termId = null, classId = null) {
    return await reportsSql.getSubjectPerformanceReport(subjectId, academicYearId, termId, classId);
  }

  async getStudentProgressReport(studentId, academicYearId = null) {
    return await reportsSql.getStudentProgressReport(studentId, academicYearId);
  }

  async getFeeCollectionSummary(academicYearId = null, termId = null, classId = null, startDate = null, endDate = null) {
    return await reportsSql.getFeeCollectionSummary(academicYearId, termId, classId, startDate, endDate);
  }

  async getPaymentHistoryReport(academicYearId = null, classId = null, studentId = null, startDate = null, endDate = null, status = null) {
    return await reportsSql.getPaymentHistoryReport(academicYearId, classId, studentId, startDate, endDate, status);
  }

  async getOutstandingFeesReport(academicYearId = null, classId = null) {
    return await reportsSql.getOutstandingFeesReport(academicYearId, classId);
  }

  async getTeacherWorkloadReport(academicYearId = null) {
    return await reportsSql.getTeacherWorkloadReport(academicYearId);
  }

  async getTeacherSubjectAssignment(academicYearId = null) {
    return await reportsSql.getTeacherSubjectAssignment(academicYearId);
  }

  async getOverallSchoolStatistics(academicYearId = null) {
    return await reportsSql.getOverallSchoolStatistics(academicYearId);
  }

  async getDashboardSummary(academicYearId = null) {
    return await reportsSql.getDashboardSummary(academicYearId);
  }

  convertToCSV(data, headers) {
    if (!data || data.length === 0) return '';
    
    const headerRow = headers.join(',');
    const rows = data.map(row => {
      return headers.map(header => {
        const key = header.toLowerCase().replace(/ /g, '_');
        let value = row[key] || row[header] || '';
        
        if (typeof value === 'object') {
          value = JSON.stringify(value).replace(/"/g, '""');
        }
        
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        
        return value;
      }).join(',');
    });
    
    return [headerRow, ...rows].join('\n');
  }

  generatePDFData(reportType, data, title, filters = {}) {
    return {
      title,
      reportType,
      generatedAt: new Date().toISOString(),
      filters,
      data,
      summary: {
        totalRecords: data.length,
        ...this.getReportSummary(reportType, data)
      }
    };
  }

  getReportSummary(reportType, data) {
    switch (reportType) {
      case 'attendance':
        const present = data.filter(r => r.status === 'present').length;
        const absent = data.filter(r => r.status === 'absent').length;
        return {
          presentCount: present,
          absentCount: absent,
          attendanceRate: data.length > 0 ? ((present / data.length) * 100).toFixed(2) + '%' : '0%'
        };
      case 'fees':
        const totalCollected = data.reduce((sum, r) => sum + (parseFloat(r.total_collected) || 0), 0);
        const totalExpected = data.reduce((sum, r) => sum + (parseFloat(r.total_expected) || 0), 0);
        return {
          totalExpected,
          totalCollected,
          collectionRate: totalExpected > 0 ? ((totalCollected / totalExpected) * 100).toFixed(2) + '%' : '0%'
        };
      case 'grades':
        const avgPercentage = data.length > 0 
          ? (data.reduce((sum, r) => sum + (parseFloat(r.average_percentage) || 0), 0) / data.length).toFixed(2)
          : 0;
        return {
          averagePercentage: avgPercentage + '%',
          totalStudents: data.length
        };
      default:
        return { totalRecords: data.length };
    }
  }
}

module.exports = new ReportsService();

