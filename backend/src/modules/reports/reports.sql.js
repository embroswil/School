const db = require("../../config/db");

const getDailyAttendanceReport = async (date, classId = null, academicYearId = null) => {
  let query = `
    SELECT 
      a.id,
      a.student_id,
      a.class_id,
      a.date,
      a.status,
      a.period_number,
      a.subject_id,
      a.remarks,
      u.first_name as student_first_name,
      u.last_name as student_last_name,
      c.name as class_name,
      c.level,
      c.section,
      s.name as subject_name,
      ay.name as academic_year_name,
      t.name as term_name,
      m.first_name as marked_by_first_name,
      m.last_name as marked_by_last_name
    FROM attendance a
    JOIN users u ON a.student_id = u.id
    JOIN classes c ON a.class_id = c.id
    LEFT JOIN subjects s ON a.subject_id = s.id
    LEFT JOIN academic_years ay ON a.academic_year_id = ay.id
    LEFT JOIN terms t ON a.term_id = t.id
    LEFT JOIN users m ON a.marked_by = m.id
    WHERE a.date = $1
  `;

  const values = [date];

  if (classId) {
    query += ` AND a.class_id = $${values.length + 1}`;
    values.push(classId);
  }

  if (academicYearId) {
    query += ` AND a.academic_year_id = $${values.length + 1}`;
    values.push(academicYearId);
  }

  query += ` ORDER BY c.name, u.last_name, u.first_name`;

  const result = await db.query(query, values);
  return result.rows;
};

const getAttendanceSummaryByClass = async (classId, academicYearId = null, termId = null, startDate = null, endDate = null) => {
  let query = `
    SELECT 
      u.id as student_id,
      u.first_name as student_first_name,
      u.last_name as student_last_name,
      COUNT(a.id) as total_days,
      SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_days,
      SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_days,
      SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as late_days,
      SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END) as excused_days,
      ROUND(
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::numeric / 
        NULLIF(COUNT(a.id), 0) * 100, 2
      ) as attendance_percentage,
      CASE 
        WHEN ROUND(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(a.id), 0) * 100, 2) >= 90 THEN 'Excellent'
        WHEN ROUND(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(a.id), 0) * 100, 2) >= 80 THEN 'Good'
        WHEN ROUND(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(a.id), 0) * 100, 2) >= 70 THEN 'Fair'
        ELSE 'Needs Improvement'
      END as attendance_grade
    FROM users u
    JOIN class_students cs ON u.id = cs.student_id
    LEFT JOIN attendance a ON u.id = a.student_id AND a.class_id = cs.class_id
    WHERE cs.class_id = $1 AND cs.status = 'active'
  `;

  const values = [classId];

  if (academicYearId) {
    query += ` AND cs.academic_year_id = $${values.length + 1}`;
    values.push(academicYearId);
  }

  if (termId) {
    query += ` AND a.term_id = $${values.length + 1}`;
    values.push(termId);
  }

  if (startDate) {
    query += ` AND a.date >= $${values.length + 1}`;
    values.push(startDate);
  }

  if (endDate) {
    query += ` AND a.date <= $${values.length + 1}`;
    values.push(endDate);
  }

  query += ` GROUP BY u.id, u.first_name, u.last_name ORDER BY attendance_percentage DESC, u.last_name, u.first_name`;

  const result = await db.query(query, values);
  return result.rows;
};

const getAttendanceTrendReport = async (academicYearId = null, termId = null, classId = null, startDate = null, endDate = null) => {
  let query = `
    SELECT 
      a.date,
      COUNT(a.id) as total_records,
      SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_count,
      SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
      SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as late_count,
      SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END) as excused_count,
      ROUND(
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::numeric / 
        NULLIF(COUNT(a.id), 0) * 100, 2
      ) as daily_attendance_percentage,
      c.name as class_name,
      c.level,
      c.section
    FROM attendance a
    LEFT JOIN classes c ON a.class_id = c.id
    WHERE 1=1
  `;

  const values = [];

  if (academicYearId) {
    query += ` AND a.academic_year_id = $${values.length + 1}`;
    values.push(academicYearId);
  }

  if (termId) {
    query += ` AND a.term_id = $${values.length + 1}`;
    values.push(termId);
  }

  if (classId) {
    query += ` AND a.class_id = $${values.length + 1}`;
    values.push(classId);
  }

  if (startDate) {
    query += ` AND a.date >= $${values.length + 1}`;
    values.push(startDate);
  }

  if (endDate) {
    query += ` AND a.date <= $${values.length + 1}`;
    values.push(endDate);
  }

  query += ` GROUP BY a.date, c.name, c.level, c.section ORDER BY a.date DESC`;

  const result = await db.query(query, values);
  return result.rows;
};

const getGradeSummaryByClass = async (classId, academicYearId = null, termId = null, subjectId = null) => {
  let query = `
    SELECT 
      u.id as student_id,
      u.first_name as student_first_name,
      u.last_name as student_last_name,
      s.id as subject_id,
      s.name as subject_name,
      s.code as subject_code,
      COUNT(sg.id) as total_grades,
      AVG(sg.percentage) as average_percentage,
      MAX(sg.percentage) as highest_percentage,
      MIN(sg.percentage) as lowest_percentage,
      MAX(sg.letter_grade) as letter_grade,
      MAX(sg.grade_point) as grade_point
    FROM users u
    JOIN class_students cs ON u.id = cs.student_id
    LEFT JOIN student_grades sg ON u.id = sg.student_id AND sg.class_id = cs.class_id
    LEFT JOIN subjects s ON sg.subject_id = s.id
    WHERE cs.class_id = $1 AND cs.status = 'active'
  `;

  const values = [classId];

  if (academicYearId) {
    query += ` AND cs.academic_year_id = $${values.length + 1}`;
    values.push(academicYearId);
  }

  if (termId) {
    query += ` AND sg.term_id = $${values.length + 1}`;
    values.push(termId);
  }

  if (subjectId) {
    query += ` AND sg.subject_id = $${values.length + 1}`;
    values.push(subjectId);
  }

  query += ` GROUP BY u.id, u.first_name, u.last_name, s.id, s.name, s.code ORDER BY u.last_name, u.first_name`;

  const result = await db.query(query, values);
  return result.rows;
};

const getSubjectPerformanceReport = async (subjectId, academicYearId = null, termId = null, classId = null) => {
  let query = `
    SELECT 
      s.id as subject_id,
      s.name as subject_name,
      s.code as subject_code,
      c.id as class_id,
      c.name as class_name,
      c.level,
      COUNT(sg.id) as total_students,
      AVG(sg.percentage) as average_percentage,
      MAX(sg.percentage) as highest_percentage,
      MIN(sg.percentage) as lowest_percentage,
      COUNT(CASE WHEN sg.percentage >= 90 THEN 1 END) as grade_a_count,
      COUNT(CASE WHEN sg.percentage >= 80 AND sg.percentage < 90 THEN 1 END) as grade_b_count,
      COUNT(CASE WHEN sg.percentage >= 70 AND sg.percentage < 80 THEN 1 END) as grade_c_count,
      COUNT(CASE WHEN sg.percentage >= 60 AND sg.percentage < 70 THEN 1 END) as grade_d_count,
      COUNT(CASE WHEN sg.percentage < 60 THEN 1 END) as grade_f_count,
      ay.name as academic_year_name,
      t.name as term_name
    FROM subjects s
    LEFT JOIN student_grades sg ON s.id = sg.subject_id
    LEFT JOIN classes c ON sg.class_id = c.id
    LEFT JOIN academic_years ay ON sg.academic_year_id = ay.id
    LEFT JOIN terms t ON sg.term_id = t.id
    WHERE s.id = $1
  `;

  const values = [subjectId];

  if (academicYearId) {
    query += ` AND sg.academic_year_id = $${values.length + 1}`;
    values.push(academicYearId);
  }

  if (termId) {
    query += ` AND sg.term_id = $${values.length + 1}`;
    values.push(termId);
  }

  if (classId) {
    query += ` AND sg.class_id = $${values.length + 1}`;
    values.push(classId);
  }

  query += ` GROUP BY s.id, s.name, s.code, c.id, c.name, c.level, ay.name, t.name`;

  const result = await db.query(query, values);
  return result.rows;
};

const getStudentProgressReport = async (studentId, academicYearId = null) => {
  let query = `
    SELECT 
      u.id as student_id,
      u.first_name as student_first_name,
      u.last_name as student_last_name,
      s.id as subject_id,
      s.name as subject_name,
      s.code as subject_code,
      c.id as class_id,
      c.name as class_name,
      ay.id as academic_year_id,
      ay.name as academic_year_name,
      t.id as term_id,
      t.name as term_name,
      COUNT(sg.id) as total_assessments,
      AVG(sg.percentage) as average_percentage,
      MAX(sg.percentage) as highest_score,
      MIN(sg.percentage) as lowest_score,
      MAX(sg.letter_grade) as final_grade,
      MAX(sg.grade_point) as grade_point
    FROM users u
    LEFT JOIN student_grades sg ON u.id = sg.student_id
    LEFT JOIN subjects s ON sg.subject_id = s.id
    LEFT JOIN classes c ON sg.class_id = c.id
    LEFT JOIN academic_years ay ON sg.academic_year_id = ay.id
    LEFT JOIN terms t ON sg.term_id = t.id
    WHERE u.id = $1
  `;

  const values = [studentId];

  if (academicYearId) {
    query += ` AND sg.academic_year_id = $${values.length + 1}`;
    values.push(academicYearId);
  }

  query += ` GROUP BY u.id, u.first_name, u.last_name, s.id, s.name, s.code, c.id, c.name, ay.id, ay.name, t.id, t.name ORDER BY ay.name, t.name, s.name`;

  const result = await db.query(query, values);
  return result.rows;
};

const getFeeCollectionSummary = async (academicYearId = null, termId = null, classId = null, startDate = null, endDate = null) => {
  let query = `
    SELECT 
      fs.id as fee_structure_id,
      fs.name as fee_name,
      fs.amount as fee_amount,
      fs.category,
      c.id as class_id,
      c.name as class_name,
      COUNT(sf.id) as total_students,
      SUM(sf.amount) as total_expected,
      SUM(sf.paid_amount) as total_collected,
      SUM(sf.balance) as total_balance,
      ROUND(SUM(sf.paid_amount)::numeric / NULLIF(SUM(sf.amount), 0) * 100, 2) as collection_percentage,
      COUNT(CASE WHEN sf.status = 'paid' THEN 1 END) as fully_paid_count,
      COUNT(CASE WHEN sf.status = 'partial' THEN 1 END) as partial_payment_count,
      COUNT(CASE WHEN sf.status = 'unpaid' THEN 1 END) as unpaid_count,
      COUNT(CASE WHEN sf.status = 'overdue' THEN 1 END) as overdue_count
    FROM fee_structures fs
    LEFT JOIN student_fees sf ON fs.id = sf.fee_structure_id
    LEFT JOIN classes c ON sf.class_id = c.id
    WHERE fs.is_active = true
  `;

  const values = [];

  if (academicYearId) {
    query += ` AND sf.academic_year_id = $${values.length + 1}`;
    values.push(academicYearId);
  }

  if (termId) {
    query += ` AND EXISTS (SELECT 1 FROM terms t WHERE t.academic_year_id = sf.academic_year_id AND t.id = $${values.length + 1})`;
    values.push(termId);
  }

  if (classId) {
    query += ` AND sf.class_id = $${values.length + 1}`;
    values.push(classId);
  }

  if (startDate) {
    query += ` AND sf.due_date >= $${values.length + 1}`;
    values.push(startDate);
  }

  if (endDate) {
    query += ` AND sf.due_date <= $${values.length + 1}`;
    values.push(endDate);
  }

  query += ` GROUP BY fs.id, fs.name, fs.amount, fs.category, c.id, c.name ORDER BY fs.name, c.name`;

  const result = await db.query(query, values);
  return result.rows;
};

const getPaymentHistoryReport = async (academicYearId = null, classId = null, studentId = null, startDate = null, endDate = null, status = null) => {
  let query = `
    SELECT 
      p.id as payment_id,
      p.student_id,
      p.amount as payment_amount,
      p.payment_date,
      p.payment_method,
      p.transaction_id,
      p.receipt_number,
      p.status as payment_status,
      p.gateway_response,
      u.first_name as student_first_name,
      u.last_name as student_last_name,
      c.name as class_name,
      fs.name as fee_name,
      sf.amount as total_fee_amount,
      sf.paid_amount as total_paid,
      sf.balance as remaining_balance
    FROM payments p
    JOIN users u ON p.student_id = u.id
    LEFT JOIN student_fees sf ON p.student_fee_id = sf.id
    LEFT JOIN fee_structures fs ON sf.fee_structure_id = fs.id
    LEFT JOIN classes c ON sf.class_id = c.id
    WHERE p.status = 'completed'
  `;

  const values = [];

  if (academicYearId) {
    query += ` AND sf.academic_year_id = $${values.length + 1}`;
    values.push(academicYearId);
  }

  if (classId) {
    query += ` AND sf.class_id = $${values.length + 1}`;
    values.push(classId);
  }

  if (studentId) {
    query += ` AND p.student_id = $${values.length + 1}`;
    values.push(studentId);
  }

  if (startDate) {
    query += ` AND p.payment_date >= $${values.length + 1}`;
    values.push(startDate);
  }

  if (endDate) {
    query += ` AND p.payment_date <= $${values.length + 1}`;
    values.push(endDate);
  }

  if (status) {
    query += ` AND p.status = $${values.length + 1}`;
    values.push(status);
  }

  query += ` ORDER BY p.payment_date DESC`;

  const result = await db.query(query, values);
  return result.rows;
};

const getOutstandingFeesReport = async (academicYearId = null, classId = null) => {
  let query = `
    SELECT 
      u.id as student_id,
      u.first_name as student_first_name,
      u.last_name as student_last_name,
      u.email as student_email,
      c.id as class_id,
      c.name as class_name,
      SUM(sf.amount) as total_fee_amount,
      SUM(sf.paid_amount) as total_paid,
      SUM(sf.balance) as total_balance,
      COUNT(sf.id) as fee_count,
      MIN(sf.due_date) as earliest_due_date,
      MAX(sf.due_date) as latest_due_date,
      CASE 
        WHEN SUM(sf.balance) > 0 THEN 'outstanding'
        ELSE 'settled'
      END as payment_status
    FROM users u
    JOIN student_fees sf ON u.id = sf.student_id
    JOIN classes c ON sf.class_id = c.id
    WHERE sf.status IN ('unpaid', 'partial', 'overdue')
  `;

  const values = [];

  if (academicYearId) {
    query += ` AND sf.academic_year_id = $${values.length + 1}`;
    values.push(academicYearId);
  }

  if (classId) {
    query += ` AND sf.class_id = $${values.length + 1}`;
    values.push(classId);
  }

  query += ` GROUP BY u.id, u.first_name, u.last_name, u.email, c.id, c.name ORDER BY total_balance DESC`;

  const result = await db.query(query, values);
  return result.rows;
};

const getTeacherWorkloadReport = async (academicYearId = null) => {
  let query = `
    SELECT 
      u.id as teacher_id,
      u.first_name as teacher_first_name,
      u.last_name as teacher_last_name,
      u.email as teacher_email,
      COUNT(DISTINCT cs.class_id) as classes_count,
      COUNT(DISTINCT ts.subject_id) as subjects_count,
      COUNT(DISTINCT t.id) as timetable_entries,
      COUNT(DISTINCT CASE WHEN c.class_teacher_id = u.id THEN c.id END) as classes_taught,
      (
        SELECT COUNT(DISTINCT a.class_id) 
        FROM attendance a 
        WHERE a.marked_by = u.id
      ) as attendance_marked_count,
      (
        SELECT COUNT(DISTINCT sg.id) 
        FROM student_grades sg 
        WHERE sg.entered_by = u.id
      ) as grades_entered_count
    FROM users u
    LEFT JOIN teacher_subjects ts ON u.id = ts.teacher_id
    LEFT JOIN class_subjects cs ON u.id = cs.teacher_id
    LEFT JOIN timetable t ON u.id = t.teacher_id
    LEFT JOIN classes c ON cs.class_id = c.id
    WHERE u.role = 'teacher'
  `;

  const values = [];

  if (academicYearId) {
    query += ` AND (cs.academic_year_id = $${values.length + 1} OR t.academic_year_id = $${values.length + 1} OR c.academic_year_id = $${values.length + 1})`;
    values.push(academicYearId);
  }

  query += ` GROUP BY u.id, u.first_name, u.last_name, u.email ORDER BY classes_count DESC, subjects_count DESC`;

  const result = await db.query(query, values);
  return result.rows;
};

const getTeacherSubjectAssignment = async (academicYearId = null) => {
  let query = `
    SELECT 
      u.id as teacher_id,
      u.first_name as teacher_first_name,
      u.last_name as teacher_last_name,
      s.id as subject_id,
      s.name as subject_name,
      s.code as subject_code,
      c.id as class_id,
      c.name as class_name,
      c.level,
      cs.is_primary,
      ay.name as academic_year_name
    FROM users u
    JOIN teacher_subjects ts ON u.id = ts.teacher_id
    JOIN subjects s ON ts.subject_id = s.id
    LEFT JOIN class_subjects cs ON u.id = cs.teacher_id AND s.id = cs.subject_id
    LEFT JOIN classes c ON cs.class_id = c.id
    LEFT JOIN academic_years ay ON cs.academic_year_id = ay.id
    WHERE u.role = 'teacher'
  `;

  const values = [];

  if (academicYearId) {
    query += ` AND (cs.academic_year_id = $${values.length + 1} OR $${values.length + 1} IS NULL)`;
    values.push(academicYearId);
  }

  query += ` ORDER BY u.last_name, u.first_name, s.name, c.name`;

  const result = await db.query(query, values);
  return result.rows;
};

const getOverallSchoolStatistics = async (academicYearId = null) => {
  let query = `
    SELECT 
      (SELECT COUNT(*) FROM users WHERE role = 'student' AND is_active = true) as total_students,
      (SELECT COUNT(*) FROM users WHERE role = 'teacher' AND is_active = true) as total_teachers,
      (SELECT COUNT(*) FROM users WHERE role = 'parent' AND is_active = true) as total_parents,
      (SELECT COUNT(*) FROM classes WHERE is_active = true) as total_classes,
      (SELECT COUNT(*) FROM subjects WHERE is_active = true) as total_subjects,
      (SELECT COUNT(DISTINCT academic_year_id) FROM classes) as active_academic_years,
      (SELECT COUNT(*) FROM academic_years WHERE is_current = true) as current_academic_years
  `;

  const result = await db.query(query);
  return result.rows[0];
};

const getDashboardSummary = async (academicYearId = null) => {
  const stats = await getOverallSchoolStatistics(academicYearId);

  const todayAttendance = await db.query(`
    SELECT 
      COUNT(*) as total_records,
      SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count,
      SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count
    FROM attendance 
    WHERE date = CURRENT_DATE
  `);

  const recentPayments = await db.query(`
    SELECT 
      COUNT(*) as total_payments,
      SUM(amount) as total_amount
    FROM payments 
    WHERE status = 'completed' 
    AND payment_date >= CURRENT_DATE - INTERVAL '7 days'
  `);

  const pendingFees = await db.query(`
    SELECT 
      SUM(balance) as total_pending
    FROM student_fees 
    WHERE status IN ('unpaid', 'partial', 'overdue')
  `);

  return {
    ...stats,
    today_attendance: todayAttendance.rows[0],
    recent_payments: recentPayments.rows[0],
    pending_fees: pendingFees.rows[0]
  };
};

module.exports = {
  getDailyAttendanceReport,
  getAttendanceSummaryByClass,
  getAttendanceTrendReport,
  getGradeSummaryByClass,
  getSubjectPerformanceReport,
  getStudentProgressReport,
  getFeeCollectionSummary,
  getPaymentHistoryReport,
  getOutstandingFeesReport,
  getTeacherWorkloadReport,
  getTeacherSubjectAssignment,
  getOverallSchoolStatistics,
  getDashboardSummary
};

