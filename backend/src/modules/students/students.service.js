const studentsSql = require("./students.sql");
const userSql = require("../users/user.sql");
const ApiError = require("../../utils/ApiError");

const createStudentRecord = async (data) => {
  const { studentId, admissionNumber } = data;
  
  if (!studentId || !admissionNumber) {
    throw new ApiError(400, "Student ID and admission number are required");
  }
  
  
  const student = await userSql.findUserById(studentId);
  if (!student) {
    throw new ApiError(404, "Student user not found");
  }
  if (student.role !== "student") {
    throw new ApiError(400, "User must have student role");
  }
  
  
  const existing = await studentsSql.getStudentRecordByAdmissionNumber(admissionNumber);
  if (existing) {
    throw new ApiError(400, "Admission number already exists");
  }
  
  
  const existingRecord = await studentsSql.getStudentRecordByStudentId(studentId);
  if (existingRecord) {
    throw new ApiError(400, "Student record already exists");
  }
  
  return studentsSql.createStudentRecord(data);
};

const getStudentRecordById = async (id) => {
  const record = await studentsSql.getStudentRecordById(id);
  if (!record) {
    throw new ApiError(404, "Student record not found");
  }
  return record;
};

const getStudentRecordByStudentId = async (studentId) => {
  const record = await studentsSql.getStudentRecordByStudentId(studentId);
  if (!record) {
    throw new ApiError(404, "Student record not found");
  }
  return record;
};

const getStudentRecordByAdmissionNumber = async (admissionNumber) => {
  const record = await studentsSql.getStudentRecordByAdmissionNumber(admissionNumber);
  if (!record) {
    throw new ApiError(404, "Student record not found");
  }
  return record;
};

const updateStudentRecord = async (id, updates) => {
  const record = await studentsSql.getStudentRecordById(id);
  if (!record) {
    throw new ApiError(404, "Student record not found");
  }
  
  return studentsSql.updateStudentRecord(id, updates);
};

const deleteStudentRecord = async (id) => {
  const record = await studentsSql.getStudentRecordById(id);
  if (!record) {
    throw new ApiError(404, "Student record not found");
  }
  
  return studentsSql.deleteStudentRecord(id);
};

const getAllStudents = async (academicYearId = null, classId = null, status = null, page = 1, limit = 20) => {
  return studentsSql.getAllStudents(academicYearId, classId, status, page, limit);
};

const getStudentsNotInClass = async (classId, academicYearId) => {
  if (!classId || !academicYearId) {
    throw new ApiError(400, "Class ID and academic year ID are required");
  }
  
  return studentsSql.getStudentsNotInClass(classId, academicYearId);
};

const getStudentCurrentEnrollment = async (studentId, academicYearId) => {
  if (!studentId || !academicYearId) {
    throw new ApiError(400, "Student ID and academic year ID are required");
  }
  
  return studentsSql.getStudentCurrentEnrollment(studentId, academicYearId);
};

const getStudentEnrollmentHistory = async (studentId) => {
  if (!studentId) {
    throw new ApiError(400, "Student ID is required");
  }
  
  return studentsSql.getStudentEnrollmentHistory(studentId);
};

const transferStudent = async (studentId, fromClassId, toClassId, academicYearId) => {
  
  const student = await userSql.findUserById(studentId);
  if (!student || student.role !== "student") {
    throw new ApiError(404, "Student not found");
  }
  
  
  if (fromClassId) {
    await studentsSql.updateStudentClassStatus(studentId, fromClassId, academicYearId, "transferred");
  }
  
  
  const classSql = require("../classes/class.sql");
  const toClass = await classSql.getClassById(toClassId);
  if (!toClass) {
    throw new ApiError(404, "Target class not found");
  }
  
  
  const classStudentsSql = require("../classes/class.sql");
  return classStudentsSql.enrollStudentInClass({
    studentId,
    classId: toClassId,
    academicYearId,
    status: "active"
  });
};

const updateStudentClassStatus = async (studentId, classId, academicYearId, newStatus) => {
  const validStatuses = ["active", "transferred", "graduated", "suspended"];
  if (!validStatuses.includes(newStatus)) {
    throw new ApiError(400, "Invalid status");
  }
  
  return studentsSql.updateStudentClassStatus(studentId, classId, academicYearId, newStatus);
};

module.exports = {
  createStudentRecord,
  getStudentRecordById,
  getStudentRecordByStudentId,
  getStudentRecordByAdmissionNumber,
  updateStudentRecord,
  deleteStudentRecord,
  getAllStudents,
  getStudentsNotInClass,
  getStudentCurrentEnrollment,
  getStudentEnrollmentHistory,
  transferStudent,
  updateStudentClassStatus,
};

