const db = require("../../config/db");


const getChildrenByParent = async (parentId) => {
  const query = `
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active, u.created_at,
           psl.relationship, psl.is_primary, psl.id as link_id,
           sr.admission_number, sr.date_of_birth, sr.gender, sr.nationality,
           sr.guardian_name, sr.guardian_phone, sr.guardian_email
    FROM parent_student_links psl
    JOIN users u ON psl.student_id = u.id
    LEFT JOIN student_records sr ON u.id = sr.student_id
    WHERE psl.parent_id = $1
    ORDER BY psl.is_primary DESC, u.last_name, u.first_name
  `;
  const result = await db.query(query, [parentId]);
  return result.rows;
};


const getChildCurrentEnrollment = async (studentId, academicYearId) => {
  const query = `
    SELECT cs.*, c.name as class_name, c.level, c.section,
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


const getChildGrades = async (studentId, academicYearId, termId = null) => {
  let query = `
    SELECT sg.*, sub.name as subject_name, sub.code as subject_code,
           gc.name as component_name, gc.weight as component_weight,
           c.name as class_name
    FROM student_grades sg
    LEFT JOIN subjects sub ON sg.subject_id = sub.id
    LEFT JOIN grade_components gc ON sg.grade_component_id = gc.id
    LEFT JOIN classes c ON sg.class_id = c.id
    WHERE sg.student_id = $1 AND sg.academic_year_id = $2 AND sg.is_approved = true
  `;
  const params = [studentId, academicYearId];
  
  if (termId) {
    query += ` AND sg.term_id = $3`;
    params.push(termId);
  }
  
  query += ` ORDER BY sub.name, gc.name`;
  const result = await db.query(query, params);
  return result.rows;
};


const getChildAttendanceSummary = async (studentId, academicYearId, termId = null) => {
  let query = `
    SELECT 
      COUNT(*) as total_days,
      SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_days,
      SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_days,
      SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late_days,
      SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) as excused_days
    FROM attendance
    WHERE student_id = $1 AND academic_year_id = $2
  `;
  const params = [studentId, academicYearId];
  
  if (termId) {
    query += ` AND term_id = $3`;
    params.push(termId);
  }
  
  const result = await db.query(query, params);
  return result.rows[0];
};


const getChildAttendanceDetails = async (studentId, academicYearId, termId = null, startDate = null, endDate = null) => {
  let query = `
    SELECT a.*, sub.name as subject_name, c.name as class_name
    FROM attendance a
    LEFT JOIN subjects sub ON a.subject_id = sub.id
    LEFT JOIN classes c ON a.class_id = c.id
    WHERE a.student_id = $1 AND a.academic_year_id = $2
  `;
  const params = [studentId, academicYearId];
  
  if (termId) {
    query += ` AND a.term_id = $3`;
    params.push(termId);
  }
  
  if (startDate) {
    query += ` AND a.date >= $${params.length + 1}`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND a.date <= $${params.length + 1}`;
    params.push(endDate);
  }
  
  query += ` ORDER BY a.date DESC`;
  const result = await db.query(query, params);
  return result.rows;
};


const getChildFees = async (studentId, academicYearId) => {
  const query = `
    SELECT sf.*, fs.name as fee_name, fs.category, fs.description as fee_description,
           c.name as class_name
    FROM student_fees sf
    JOIN fee_structures fs ON sf.fee_structure_id = fs.id
    LEFT JOIN classes c ON sf.class_id = c.id
    WHERE sf.student_id = $1 AND sf.academic_year_id = $2
    ORDER BY fs.due_date, fs.name
  `;
  const result = await db.query(query, [studentId, academicYearId]);
  return result.rows;
};


const getChildPayments = async (studentId, academicYearId = null) => {
  let query = `
    SELECT p.*, fs.name as fee_name
    FROM payments p
    LEFT JOIN student_fees sf ON p.student_fee_id = sf.id
    LEFT JOIN fee_structures fs ON sf.fee_structure_id = fs.id
    WHERE p.student_id = $1
  `;
  const params = [studentId];
  
  if (academicYearId) {
    query += ` AND sf.academic_year_id = $2`;
    params.push(academicYearId);
  }
  
  query += ` ORDER BY p.payment_date DESC`;
  const result = await db.query(query, params);
  return result.rows;
};


const getChildReportCard = async (studentId, academicYearId, termId = null) => {
  let query = `
    SELECT rc.*, c.name as class_name, ay.name as academic_year_name, t.name as term_name
    FROM report_cards rc
    JOIN classes c ON rc.class_id = c.id
    JOIN academic_years ay ON rc.academic_year_id = ay.id
    LEFT JOIN terms t ON rc.term_id = t.id
    WHERE rc.student_id = $1 AND rc.academic_year_id = $2
  `;
  const params = [studentId, academicYearId];
  
  if (termId) {
    query += ` AND rc.term_id = $3`;
    params.push(termId);
  }
  
  query += ` ORDER BY rc.term_id`;
  const result = await db.query(query, params);
  return termId ? result.rows[0] : result.rows;
};


const getChildTimetable = async (studentId, classId, academicYearId, termId = null) => {
  let query = `
    SELECT t.*, sub.name as subject_name, sub.code as subject_code,
           u.first_name || ' ' || u.last_name as teacher_name,
           c.name as class_name
    FROM timetable t
    LEFT JOIN subjects sub ON t.subject_id = sub.id
    LEFT JOIN users u ON t.teacher_id = u.id
    LEFT JOIN classes c ON t.class_id = c.id
    WHERE t.class_id = $1 AND t.academic_year_id = $2 AND t.is_active = true
  `;
  const params = [classId, academicYearId];
  
  if (termId) {
    query += ` AND t.term_id = $3`;
    params.push(termId);
  }
  
  query += ` ORDER BY t.day_of_week, t.period_number`;
  const result = await db.query(query, params);
  return result.rows;
};


const getParentPreferences = async (parentId) => {
  const query = `SELECT * FROM notification_preferences WHERE user_id = $1`;
  const result = await db.query(query, [parentId]);
  return result.rows[0];
};


const updateParentPreferences = async (parentId, updates) => {
  const { emailEnabled, smsEnabled, paymentAlerts, gradeAlerts, attendanceAlerts, announcementAlerts } = updates;
  
  const query = `
    INSERT INTO notification_preferences (
      user_id, email_enabled, sms_enabled, payment_alerts, grade_alerts, attendance_alerts, announcement_alerts
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id)
    DO UPDATE SET
      email_enabled = COALESCE($2, notification_preferences.email_enabled),
      sms_enabled = COALESCE($3, notification_preferences.sms_enabled),
      payment_alerts = COALESCE($4, notification_preferences.payment_alerts),
      grade_alerts = COALESCE($5, notification_preferences.grade_alerts),
      attendance_alerts = COALESCE($6, notification_preferences.attendance_alerts),
      announcement_alerts = COALESCE($7, notification_preferences.announcement_alerts),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  const result = await db.query(query, [
    parentId, emailEnabled, smsEnabled, paymentAlerts, gradeAlerts, attendanceAlerts, announcementAlerts
  ]);
  return result.rows[0];
};

module.exports = {
  getChildrenByParent,
  getChildCurrentEnrollment,
  getChildGrades,
  getChildAttendanceSummary,
  getChildAttendanceDetails,
  getChildFees,
  getChildPayments,
  getChildReportCard,
  getChildTimetable,
  getParentPreferences,
  updateParentPreferences,
};

