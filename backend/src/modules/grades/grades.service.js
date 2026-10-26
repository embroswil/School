const gradesSql = require("./grades.sql");
const ApiError = require("../../utils/ApiError");


const createGradeComponent = async (data) => {
  const { name, weight, academicYearId } = data;
  
  if (!name || !academicYearId) {
    throw new ApiError(400, "Name and academic year ID are required");
  }
  
  if (weight !== undefined && (weight < 0 || weight > 100)) {
    throw new ApiError(400, "Weight must be between 0 and 100");
  }
  
  return gradesSql.createGradeComponent(data);
};

const getGradeComponentsByYear = async (academicYearId, activeOnly = false) => {
  return gradesSql.getGradeComponentsByYear(academicYearId, activeOnly);
};

const getGradeComponentById = async (id) => {
  const component = await gradesSql.getGradeComponentById(id);
  if (!component) {
    throw new ApiError(404, "Grade component not found");
  }
  return component;
};

const updateGradeComponent = async (id, updates) => {
  const component = await gradesSql.getGradeComponentById(id);
  if (!component) {
    throw new ApiError(404, "Grade component not found");
  }
  
  if (updates.weight !== undefined && (updates.weight < 0 || updates.weight > 100)) {
    throw new ApiError(400, "Weight must be between 0 and 100");
  }
  
  return gradesSql.updateGradeComponent(id, updates);
};

const deleteGradeComponent = async (id) => {
  const component = await gradesSql.getGradeComponentById(id);
  if (!component) {
    throw new ApiError(404, "Grade component not found");
  }
  return gradesSql.deleteGradeComponent(id);
};


const createGradeScale = async (data) => {
  const { letterGrade, minPercentage, maxPercentage } = data;
  
  if (!letterGrade || minPercentage === undefined || maxPercentage === undefined) {
    throw new ApiError(400, "Letter grade, min percentage, and max percentage are required");
  }
  
  if (minPercentage < 0 || maxPercentage > 100 || minPercentage > maxPercentage) {
    throw new ApiError(400, "Invalid percentage range");
  }
  
  return gradesSql.createGradeScale(data);
};

const getAllGradeScales = async (activeOnly = false) => {
  return gradesSql.getAllGradeScales(activeOnly);
};

const getGradeScaleById = async (id) => {
  const scale = await gradesSql.getGradeScaleById(id);
  if (!scale) {
    throw new ApiError(404, "Grade scale not found");
  }
  return scale;
};

const updateGradeScale = async (id, updates) => {
  const scale = await gradesSql.getGradeScaleById(id);
  if (!scale) {
    throw new ApiError(404, "Grade scale not found");
  }
  
  if (updates.minPercentage !== undefined || updates.maxPercentage !== undefined) {
    const min = updates.minPercentage ?? scale.min_percentage;
    const max = updates.maxPercentage ?? scale.max_percentage;
    if (min < 0 || max > 100 || min > max) {
      throw new ApiError(400, "Invalid percentage range");
    }
  }
  
  return gradesSql.updateGradeScale(id, updates);
};

const deleteGradeScale = async (id) => {
  const scale = await gradesSql.getGradeScaleById(id);
  if (!scale) {
    throw new ApiError(404, "Grade scale not found");
  }
  return gradesSql.deleteGradeScale(id);
};


const createStudentGrade = async (data, enteredBy) => {
  const { studentId, classId, subjectId, academicYearId, termId, score, maxScore } = data;
  
  if (!studentId || !classId || !subjectId || !academicYearId) {
    throw new ApiError(400, "Student, class, subject, and academic year are required");
  }
  
  if (score === undefined || score === null) {
    throw new ApiError(400, "Score is required");
  }
  
  const max = maxScore || 100;
  if (score < 0 || score > max) {
    throw new ApiError(400, `Score must be between 0 and ${max}`);
  }
  
  return gradesSql.createStudentGrade({
    ...data,
    maxScore: max,
    enteredBy
  });
};

const bulkCreateStudentGrades = async (gradesData, enteredBy) => {
  if (!Array.isArray(gradesData) || gradesData.length === 0) {
    throw new ApiError(400, "Grades array is required");
  }
  
  const results = [];
  for (const gradeData of gradesData) {
    const result = await createStudentGrade({ ...gradeData, enteredBy }, enteredBy);
    results.push(result);
  }
  
  return results;
};

const getStudentGrades = async (studentId, academicYearId, termId = null, classId = null, subjectId = null) => {
  if (!studentId || !academicYearId) {
    throw new ApiError(400, "Student ID and academic year ID are required");
  }
  
  return gradesSql.getStudentGrades(studentId, academicYearId, termId, classId, subjectId);
};

const getStudentGradeById = async (id) => {
  const grade = await gradesSql.getStudentGradeById(id);
  if (!grade) {
    throw new ApiError(404, "Grade not found");
  }
  return grade;
};

const getSubjectGrades = async (subjectId, classId, academicYearId, termId = null, teacherId = null) => {
  if (!subjectId || !classId || !academicYearId) {
    throw new ApiError(400, "Subject, class, and academic year are required");
  }
  
  
  if (teacherId) {
    
    
  }
  
  return gradesSql.getSubjectGrades(subjectId, classId, academicYearId, termId);
};

const updateStudentGrade = async (id, updates, updatedBy) => {
  const grade = await gradesSql.getStudentGradeById(id);
  if (!grade) {
    throw new ApiError(404, "Grade not found");
  }
  
  if (grade.is_locked) {
    throw new ApiError(400, "Cannot update a locked grade");
  }
  
  if (grade.is_approved && !updatedBy.role === 'admin') {
    throw new ApiError(400, "Cannot update an approved grade without admin privileges");
  }
  
  if (updates.score !== undefined) {
    const max = updates.maxScore || grade.max_score;
    if (updates.score < 0 || updates.score > max) {
      throw new ApiError(400, `Score must be between 0 and ${max}`);
    }
  }
  
  return gradesSql.updateStudentGrade(id, updates, updatedBy);
};

const deleteStudentGrade = async (id) => {
  const grade = await gradesSql.getStudentGradeById(id);
  if (!grade) {
    throw new ApiError(404, "Grade not found");
  }
  
  if (grade.is_locked) {
    throw new ApiError(400, "Cannot delete a locked grade");
  }
  
  if (grade.is_approved) {
    throw new ApiError(400, "Cannot delete an approved grade");
  }
  
  return gradesSql.deleteStudentGrade(id);
};

const approveGrade = async (id, approvedBy) => {
  const grade = await gradesSql.getStudentGradeById(id);
  if (!grade) {
    throw new ApiError(404, "Grade not found");
  }
  
  if (grade.is_approved) {
    throw new ApiError(400, "Grade is already approved");
  }
  
  if (grade.is_locked) {
    throw new ApiError(400, "Cannot approve a locked grade");
  }
  
  return gradesSql.approveGrade(id, approvedBy);
};

const lockGrade = async (id, lockedBy) => {
  const grade = await gradesSql.getStudentGradeById(id);
  if (!grade) {
    throw new ApiError(404, "Grade not found");
  }
  
  if (grade.is_locked) {
    throw new ApiError(400, "Grade is already locked");
  }
  
  return gradesSql.lockGrade(id, lockedBy);
};

const unlockGrade = async (id) => {
  const grade = await gradesSql.getStudentGradeById(id);
  if (!grade) {
    throw new ApiError(404, "Grade not found");
  }
  
  if (!grade.is_locked) {
    throw new ApiError(400, "Grade is not locked");
  }
  
  return gradesSql.unlockGrade(id);
};


const generateReportCard = async (data, generatedBy) => {
  const { studentId, classId, academicYearId, termId } = data;
  
  if (!studentId || !classId || !academicYearId || !termId) {
    throw new ApiError(400, "Student, class, academic year, and term are required");
  }
  
  return gradesSql.generateReportCard({
    ...data,
    generatedBy
  });
};

const getReportCard = async (studentId, academicYearId, termId = null) => {
  if (!studentId || !academicYearId) {
    throw new ApiError(400, "Student ID and academic year ID are required");
  }
  
  return gradesSql.getReportCard(studentId, academicYearId, termId);
};

const getClassReportCards = async (classId, academicYearId, termId = null) => {
  if (!classId || !academicYearId) {
    throw new ApiError(400, "Class ID and academic year ID are required");
  }
  
  return gradesSql.getClassReportCards(classId, academicYearId, termId);
};

const finalizeReportCard = async (id, finalizedBy) => {
  const reportCard = await gradesSql.getReportCard(id);
  if (!reportCard) {
    throw new ApiError(404, "Report card not found");
  }
  
  if (reportCard.is_finalized) {
    throw new ApiError(400, "Report card is already finalized");
  }
  
  return gradesSql.finalizeReportCard(id, finalizedBy);
};

const deleteReportCard = async (id) => {
  const reportCard = await gradesSql.getReportCard(id);
  if (!reportCard) {
    throw new ApiError(404, "Report card not found");
  }
  
  if (reportCard.is_finalized) {
    throw new ApiError(400, "Cannot delete a finalized report card");
  }
  
  return gradesSql.deleteReportCard(id);
};

module.exports = {
  
  createGradeComponent,
  getGradeComponentsByYear,
  getGradeComponentById,
  updateGradeComponent,
  deleteGradeComponent,
  
  
  createGradeScale,
  getAllGradeScales,
  getGradeScaleById,
  updateGradeScale,
  deleteGradeScale,
  
  
  createStudentGrade,
  bulkCreateStudentGrades,
  getStudentGrades,
  getStudentGradeById,
  getSubjectGrades,
  updateStudentGrade,
  deleteStudentGrade,
  approveGrade,
  lockGrade,
  unlockGrade,
  
  
  generateReportCard,
  getReportCard,
  getClassReportCards,
  finalizeReportCard,
  deleteReportCard,
};

