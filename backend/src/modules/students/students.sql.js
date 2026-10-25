const db = require("../../config/db");
const { ecoleFiltre } = require("../../utils/contexte");


const createStudentRecord = async (data) => {
  const {
    studentId, admissionNumber, dateOfBirth, gender, nationality,
    previousSchool, medicalConditions, emergencyContactName, emergencyContactPhone,
    guardianName, guardianRelationship, guardianPhone, guardianEmail
  } = data;
  
  const query = `
    INSERT INTO student_records (
      student_id, admission_number, date_of_birth, gender, nationality,
      previous_school, medical_conditions, emergency_contact_name, emergency_contact_phone,
      guardian_name, guardian_relationship, guardian_phone, guardian_email
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `;
  const result = await db.query(query, [
    studentId, admissionNumber, dateOfBirth, gender, nationality,
    previousSchool, medicalConditions, emergencyContactName, emergencyContactPhone,
    guardianName, guardianRelationship, guardianPhone, guardianEmail
  ]);
  return result.rows[0];
};

const getStudentRecordById = async (id) => {
  const query = `
    SELECT sr.*,
           u.first_name, u.last_name, u.email, u.phone, u.is_active
    FROM student_records sr
    JOIN users u ON sr.student_id = u.id
    WHERE sr.id = $1
  `;
  const result = await db.query(query, [id]);
  return result.rows[0];
};

const getStudentRecordByStudentId = async (studentId) => {
  const query = `
    SELECT sr.*,
           u.first_name, u.last_name, u.email, u.phone, u.is_active
    FROM student_records sr
    JOIN users u ON sr.student_id = u.id
    WHERE sr.student_id = $1
  `;
  const result = await db.query(query, [studentId]);
  return result.rows[0];
};

const getStudentRecordByAdmissionNumber = async (admissionNumber) => {
  const query = `
    SELECT sr.*,
           u.first_name, u.last_name, u.email, u.phone, u.is_active
    FROM student_records sr
    JOIN users u ON sr.student_id = u.id
    WHERE sr.admission_number = $1
  `;
  const result = await db.query(query, [admissionNumber]);
  return result.rows[0];
};

const updateStudentRecord = async (id, updates) => {
  const {
    dateOfBirth, gender, nationality, previousSchool, medicalConditions,
    emergencyContactName, emergencyContactPhone, guardianName, guardianRelationship,
    guardianPhone, guardianEmail
  } = updates;
  
  const query = `
    UPDATE student_records
    SET date_of_birth = COALESCE($2, date_of_birth),
        gender = COALESCE($3, gender),
        nationality = COALESCE($4, nationality),
        previous_school = COALESCE($5, previous_school),
        medical_conditions = COALESCE($6, medical_conditions),
        emergency_contact_name = COALESCE($7, emergency_contact_name),
        emergency_contact_phone = COALESCE($8, emergency_contact_phone),
        guardian_name = COALESCE($9, guardian_name),
        guardian_relationship = COALESCE($10, guardian_relationship),
        guardian_phone = COALESCE($11, guardian_phone),
        guardian_email = COALESCE($12, guardian_email),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  const result = await db.query(query, [
    id, dateOfBirth, gender, nationality, previousSchool, medicalConditions,
    emergencyContactName, emergencyContactPhone, guardianName, guardianRelationship,
    guardianPhone, guardianEmail
  ]);
  return result.rows[0];
};

const deleteStudentRecord = async (id) => {
  const query = `DELETE FROM student_records WHERE id = $1 RETURNING *`;
  const result = await db.query(query, [id]);
  return result.rows[0];
};


const getAllStudents = async (academicYearId = null, classId = null, status = null, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active, u.created_at,
           sr.admission_number, sr.date_of_birth, sr.gender, sr.nationality,
           cs.class_id, c.name as class_name, c.level as class_level
    FROM users u
    JOIN student_records sr ON u.id = sr.student_id
    LEFT JOIN class_students cs ON u.id = cs.student_id
    LEFT JOIN classes c ON cs.class_id = c.id
    WHERE u.role = 'student'
  `;
  
  const params = [];
  const ecole = ecoleFiltre();
  if (ecole) {
    query += ` AND u.school_id = $${params.length + 1}`;
    params.push(ecole);
  }
  
  if (academicYearId) {
    query += ` AND cs.academic_year_id = $${params.length + 1}`;
    params.push(academicYearId);
  }
  
  if (classId) {
    query += ` AND cs.class_id = $${params.length + 1}`;
    params.push(classId);
  }
  
  if (status) {
    query += ` AND cs.status = $${params.length + 1}`;
    params.push(status);
  }
  
  query += ` ORDER BY u.last_name, u.first_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);
  
  const result = await db.query(query, params);
  return result.rows;
};


const getStudentsNotInClass = async (classId, academicYearId) => {
  const query = `
    SELECT u.id, u.first_name, u.last_name, u.email, sr.admission_number
    FROM users u
    JOIN student_records sr ON u.id = sr.student_id
    WHERE u.role = 'student' AND u.is_active = true
    AND ($3::int IS NULL OR u.school_id = $3)
    AND u.id NOT IN (
      SELECT student_id FROM class_students 
      WHERE class_id = $1 AND academic_year_id = $2 AND status = 'active'
    )
    ORDER BY u.last_name, u.first_name
  `;
  const result = await db.query(query, [classId, academicYearId, ecoleFiltre()]);
  return result.rows;
};


const getStudentCurrentEnrollment = async (studentId, academicYearId) => {
  const query = `
    SELECT cs.*, c.name as class_name, c.level, c.section, c.capacity,
           u.first_name || ' ' || u.last_name as class_teacher_name
    FROM class_students cs
    JOIN classes c ON cs.class_id = c.id
    LEFT JOIN users u ON c.class_teacher_id = u.id
    WHERE cs.student_id = $1 AND cs.academic_year_id = $2 AND cs.status = 'active'
    ORDER BY cs.enrolled_at DESC
    LIMIT 1
  `;
  const result = await db.query(query, [studentId, academicYearId]);
  return result.rows[0];
};


const getStudentEnrollmentHistory = async (studentId) => {
  const query = `
    SELECT cs.*, c.name as class_name, c.level, c.section,
           ay.name as academic_year_name
    FROM class_students cs
    JOIN classes c ON cs.class_id = c.id
    JOIN academic_years ay ON cs.academic_year_id = ay.id
    WHERE cs.student_id = $1
    ORDER BY cs.enrolled_at DESC
  `;
  const result = await db.query(query, [studentId]);
  return result.rows;
};


const updateStudentClassStatus = async (studentId, classId, academicYearId, newStatus) => {
  const query = `
    UPDATE class_students
    SET status = $4, updated_at = CURRENT_TIMESTAMP
    WHERE student_id = $1 AND class_id = $2 AND academic_year_id = $3
    RETURNING *
  `;
  const result = await db.query(query, [studentId, classId, academicYearId, newStatus]);
  return result.rows[0];
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
  updateStudentClassStatus,
};

