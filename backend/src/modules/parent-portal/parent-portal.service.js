const parentPortalSql = require("./parent-portal.sql");
const studentsSql = require("../students/students.sql");
const ApiError = require("../../utils/ApiError");


const getChildrenByParent = async (parentId) => {
  return parentPortalSql.getChildrenByParent(parentId);
};


const getChildDashboard = async (parentId, studentId, academicYearId, termId = null) => {
  
  const children = await parentPortalSql.getChildrenByParent(parentId);
  const child = children.find(c => c.id === studentId);
  
  if (!child) {
    throw new ApiError(403, "You are not authorized to view this student's information");
  }
  
  
  const enrollment = await parentPortalSql.getChildCurrentEnrollment(studentId, academicYearId);
  
  
  const grades = await parentPortalSql.getChildGrades(studentId, academicYearId, termId);
  
  
  const attendanceSummary = await parentPortalSql.getChildAttendanceSummary(studentId, academicYearId, termId);
  
  
  const fees = await parentPortalSql.getChildFees(studentId, academicYearId);
  
  
  const totalFee = fees.reduce((sum, f) => sum + parseFloat(f.amount), 0);
  const totalPaid = fees.reduce((sum, f) => sum + parseFloat(f.paid_amount || 0), 0);
  const totalBalance = totalFee - totalPaid;
  
  
  const reportCard = termId ? await parentPortalSql.getChildReportCard(studentId, academicYearId, termId) : null;
  
  return {
    student: {
      id: child.id,
      firstName: child.first_name,
      lastName: child.last_name,
      admissionNumber: child.admission_number
    },
    enrollment,
    grades,
    attendance: {
      summary: attendanceSummary,
      totalDays: parseInt(attendanceSummary?.total_days) || 0,
      presentDays: parseInt(attendanceSummary?.present_days) || 0,
      absentDays: parseInt(attendanceSummary?.absent_days) || 0,
      lateDays: parseInt(attendanceSummary?.late_days) || 0,
      excusedDays: parseInt(attendanceSummary?.excused_days) || 0
    },
    fees: {
      details: fees,
      totalFee,
      totalPaid,
      totalBalance
    },
    reportCard
  };
};


const getChildEnrollment = async (parentId, studentId, academicYearId) => {
  
  const children = await parentPortalSql.getChildrenByParent(parentId);
  const child = children.find(c => c.id === studentId);
  
  if (!child) {
    throw new ApiError(403, "You are not authorized to view this student's information");
  }
  
  return parentPortalSql.getChildCurrentEnrollment(studentId, academicYearId);
};


const getChildGrades = async (parentId, studentId, academicYearId, termId = null) => {
  
  const children = await parentPortalSql.getChildrenByParent(parentId);
  const child = children.find(c => c.id === studentId);
  
  if (!child) {
    throw new ApiError(403, "You are not authorized to view this student's information");
  }
  
  return parentPortalSql.getChildGrades(studentId, academicYearId, termId);
};


const getChildAttendance = async (parentId, studentId, academicYearId, termId = null, startDate = null, endDate = null) => {
  
  const children = await parentPortalSql.getChildrenByParent(parentId);
  const child = children.find(c => c.id === studentId);
  
  if (!child) {
    throw new ApiError(403, "You are not authorized to view this student's information");
  }
  
  const summary = await parentPortalSql.getChildAttendanceSummary(studentId, academicYearId, termId);
  const details = await parentPortalSql.getChildAttendanceDetails(studentId, academicYearId, termId, startDate, endDate);
  
  return { summary, details };
};


const getChildFees = async (parentId, studentId, academicYearId) => {
  
  const children = await parentPortalSql.getChildrenByParent(parentId);
  const child = children.find(c => c.id === studentId);
  
  if (!child) {
    throw new ApiError(403, "You are not authorized to view this student's information");
  }
  
  const fees = await parentPortalSql.getChildFees(studentId, academicYearId);
  
  
  const totalFee = fees.reduce((sum, f) => sum + parseFloat(f.amount), 0);
  const totalPaid = fees.reduce((sum, f) => sum + parseFloat(f.paid_amount || 0), 0);
  const totalBalance = totalFee - totalPaid;
  
  return {
    fees,
    summary: {
      totalFee,
      totalPaid,
      totalBalance,
      currency: "KES"
    }
  };
};


const getChildPayments = async (parentId, studentId, academicYearId = null) => {
  
  const children = await parentPortalSql.getChildrenByParent(parentId);
  const child = children.find(c => c.id === studentId);
  
  if (!child) {
    throw new ApiError(403, "You are not authorized to view this student's information");
  }
  
  return parentPortalSql.getChildPayments(studentId, academicYearId);
};


const getChildReportCard = async (parentId, studentId, academicYearId, termId = null) => {
  
  const children = await parentPortalSql.getChildrenByParent(parentId);
  const child = children.find(c => c.id === studentId);
  
  if (!child) {
    throw new ApiError(403, "You are not authorized to view this student's information");
  }
  
  return parentPortalSql.getChildReportCard(studentId, academicYearId, termId);
};


const getChildTimetable = async (parentId, studentId, academicYearId, termId = null) => {
  
  const children = await parentPortalSql.getChildrenByParent(parentId);
  const child = children.find(c => c.id === studentId);
  
  if (!child) {
    throw new ApiError(403, "You are not authorized to view this student's information");
  }
  
  
  const enrollment = await parentPortalSql.getChildCurrentEnrollment(studentId, academicYearId);
  
  if (!enrollment) {
    throw new ApiError(404, "Student is not enrolled in any class for this academic year");
  }
  
  return parentPortalSql.getChildTimetable(enrollment.class_id, studentId, academicYearId, termId);
};


const getNotificationPreferences = async (parentId) => {
  let prefs = await parentPortalSql.getParentPreferences(parentId);
  
  
  if (!prefs) {
    prefs = await parentPortalSql.updateParentPreferences(parentId, {});
  }
  
  return prefs;
};

const updateNotificationPreferences = async (parentId, updates) => {
  return parentPortalSql.updateParentPreferences(parentId, updates);
};

module.exports = {
  getChildrenByParent,
  getChildDashboard,
  getChildEnrollment,
  getChildGrades,
  getChildAttendance,
  getChildFees,
  getChildPayments,
  getChildReportCard,
  getChildTimetable,
  getNotificationPreferences,
  updateNotificationPreferences,
};

