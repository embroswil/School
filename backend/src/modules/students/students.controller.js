const studentsService = require("./students.service");


const createStudentRecord = async (req, res, next) => {
  try {
    const {
      studentId, admissionNumber, dateOfBirth, gender, nationality,
      previousSchool, medicalConditions, emergencyContactName, emergencyContactPhone,
      guardianName, guardianRelationship, guardianPhone, guardianEmail
    } = req.body;

    const record = await studentsService.createStudentRecord({
      studentId: parseInt(studentId),
      admissionNumber,
      dateOfBirth,
      gender,
      nationality,
      previousSchool,
      medicalConditions,
      emergencyContactName,
      emergencyContactPhone,
      guardianName,
      guardianRelationship,
      guardianPhone,
      guardianEmail
    });

    res.status(201).json({
      success: true,
      message: "Student record created successfully",
      data: record
    });
  } catch (error) {
    next(error);
  }
};

const getStudentRecordById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const record = await studentsService.getStudentRecordById(parseInt(id));

    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    next(error);
  }
};

const getStudentRecordByStudentId = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const record = await studentsService.getStudentRecordByStudentId(parseInt(studentId));

    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    next(error);
  }
};

const getStudentRecordByAdmissionNumber = async (req, res, next) => {
  try {
    const { admissionNumber } = req.params;
    const record = await studentsService.getStudentRecordByAdmissionNumber(admissionNumber);

    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    next(error);
  }
};

const updateStudentRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      dateOfBirth, gender, nationality, previousSchool, medicalConditions,
      emergencyContactName, emergencyContactPhone, guardianName, guardianRelationship,
      guardianPhone, guardianEmail
    } = req.body;

    const record = await studentsService.updateStudentRecord(parseInt(id), {
      dateOfBirth,
      gender,
      nationality,
      previousSchool,
      medicalConditions,
      emergencyContactName,
      emergencyContactPhone,
      guardianName,
      guardianRelationship,
      guardianPhone,
      guardianEmail
    });

    res.json({
      success: true,
      message: "Student record updated successfully",
      data: record
    });
  } catch (error) {
    next(error);
  }
};

const deleteStudentRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    await studentsService.deleteStudentRecord(parseInt(id));

    res.json({
      success: true,
      message: "Student record deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};

const getAllStudents = async (req, res, next) => {
  try {
    const { academicYearId, classId, status, page = 1, limit = 20 } = req.query;

    const students = await studentsService.getAllStudents(
      academicYearId ? parseInt(academicYearId) : null,
      classId ? parseInt(classId) : null,
      status,
      parseInt(page),
      parseInt(limit)
    );

    res.json({
      success: true,
      data: students
    });
  } catch (error) {
    next(error);
  }
};

const getStudentsNotInClass = async (req, res, next) => {
  try {
    const { classId, academicYearId } = req.params;

    const students = await studentsService.getStudentsNotInClass(
      parseInt(classId),
      parseInt(academicYearId)
    );

    res.json({
      success: true,
      data: students
    });
  } catch (error) {
    next(error);
  }
};

const getStudentCurrentEnrollment = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { academicYearId } = req.query;

    if (!academicYearId) {
      return res.status(400).json({
        success: false,
        message: "Academic year ID is required"
      });
    }

    const enrollment = await studentsService.getStudentCurrentEnrollment(
      parseInt(studentId),
      parseInt(academicYearId)
    );

    res.json({
      success: true,
      data: enrollment
    });
  } catch (error) {
    next(error);
  }
};

const getStudentEnrollmentHistory = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    const history = await studentsService.getStudentEnrollmentHistory(parseInt(studentId));

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    next(error);
  }
};

const transferStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { fromClassId, toClassId, academicYearId } = req.body;

    const result = await studentsService.transferStudent(
      parseInt(studentId),
      fromClassId ? parseInt(fromClassId) : null,
      parseInt(toClassId),
      parseInt(academicYearId)
    );

    res.json({
      success: true,
      message: "Student transferred successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const updateStudentClassStatus = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { classId, academicYearId, status } = req.body;

    const result = await studentsService.updateStudentClassStatus(
      parseInt(studentId),
      parseInt(classId),
      parseInt(academicYearId),
      status
    );

    res.json({
      success: true,
      message: "Student status updated successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
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

