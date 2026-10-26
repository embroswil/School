const db = require("../../config/db");


const createGradeComponent = async (data) => {
  const { name, description, weight, academicYearId, isActive } = data;
  const query = `
    INSERT INTO grade_components (name, description, weight, academic_year_id, is_active)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const result = await db.query(query, [name, description, weight, academicYearId, isActive !== false]);
  return result.rows[0];
};

const getGradeComponentsByYear = async (academicYearId, activeOnly = false) => {
  let query = `SELECT * FROM grade_components WHERE academic_year_id = $1`;
  if (activeOnly) {
    query += ` AND is_active = true`;
  }
  query += ` ORDER BY name`;
  const result = await db.query(query, [academicYearId]);
  return result.rows;
};

const getGradeComponentById = async (id) => {
  const query = `SELECT * FROM grade_components WHERE id = $1`;
  const result = await db.query(query, [id]);
  return result.rows[0];
};

const updateGradeComponent = async (id, updates) => {
  const { name, description, weight, isActive } = updates;
  const query = `
    UPDATE grade_components
    SET name = COALESCE($2, name),
        description = COALESCE($3, description),
        weight = COALESCE($4, weight),
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  const result = await db.query(query, [id, name, description, weight, isActive]);
  return result.rows[0];
};

const deleteGradeComponent = async (id) => {
  const query = `DELETE FROM grade_components WHERE id = $1 RETURNING *`;
  const result = await db.query(query, [id]);
  return result.rows[0];
};


const createGradeScale = async (data) => {
  const { letterGrade, minPercentage, maxPercentage, gradePoint, description, isActive } = data;
  const query = `
    INSERT INTO grade_scales (letter_grade, min_percentage, max_percentage, grade_point, description, is_active)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const result = await db.query(query, [letterGrade, minPercentage, maxPercentage, gradePoint, description, isActive !== false]);
  return result.rows[0];
};

const getAllGradeScales = async (activeOnly = false) => {
  let query = `SELECT * FROM grade_scales`;
  if (activeOnly) {
    query += ` WHERE is_active = true`;
  }
  query += ` ORDER BY min_percentage DESC`;
  const result = await db.query(query);
  return result.rows;
};

const getGradeScaleById = async (id) => {
  const query = `SELECT * FROM grade_scales WHERE id = $1`;
  const result = await db.query(query, [id]);
  return result.rows[0];
};

const updateGradeScale = async (id, updates) => {
  const { letterGrade, minPercentage, maxPercentage, gradePoint, description, isActive } = updates;
  const query = `
    UPDATE grade_scales
    SET letter_grade = COALESCE($2, letter_grade),
        min_percentage = COALESCE($3, min_percentage),
        max_percentage = COALESCE($4, max_percentage),
        grade_point = COALESCE($5, grade_point),
        description = COALESCE($6, description),
        is_active = COALESCE($7, is_active)
    WHERE id = $1
    RETURNING *
  `;
  const result = await db.query(query, [id, letterGrade, minPercentage, maxPercentage, gradePoint, description, isActive]);
  return result.rows[0];
};

const deleteGradeScale = async (id) => {
  const query = `DELETE FROM grade_scales WHERE id = $1 RETURNING *`;
  const result = await db.query(query, [id]);
  return result.rows[0];
};

const getGradeScaleByPercentage = async (percentage) => {
  const query = `
    SELECT * FROM grade_scales 
    WHERE is_active = true AND min_percentage <= $1 AND max_percentage >= $1
    LIMIT 1
  `;
  const result = await db.query(query, [percentage]);
  return result.rows[0];
};


const createStudentGrade = async (data) => {
  const { studentId, classId, subjectId, academicYearId, termId, gradeComponentId, score, maxScore, remarks, enteredBy } = data;
  
  
  const percentage = maxScore ? (score / maxScore) * 100 : null;
  
  
  let letterGrade = null;
  let gradePoint = null;
  if (percentage !== null) {
    const scale = await getGradeScaleByPercentage(percentage);
    if (scale) {
      letterGrade = scale.letter_grade;
      gradePoint = scale.grade_point;
    }
  }

  const query = `
    INSERT INTO student_grades (
      student_id, class_id, subject_id, academic_year_id, term_id, 
      grade_component_id, score, max_score, percentage, letter_grade, grade_point, 
      remarks, entered_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (student_id, class_id, subject_id, academic_year_id, term_id, grade_component_id)
    DO UPDATE SET 
      score = EXCLUDED.score,
      max_score = EXCLUDED.max_score,
      percentage = EXCLUDED.percentage,
      letter_grade = EXCLUDED.letter_grade,
      grade_point = EXCLUDED.grade_point,
      remarks = EXCLUDED.remarks,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  const result = await db.query(query, [
    studentId, classId, subjectId, academicYearId, termId, 
    gradeComponentId, score, maxScore || 100, percentage, letterGrade, gradePoint, 
    remarks, enteredBy
  ]);
  return result.rows[0];
};

const bulkCreateStudentGrades = async (gradesData) => {
  const results = [];
  for (const gradeData of gradesData) {
    const result = await createStudentGrade(gradeData);
    results.push(result);
  }
  return results;
};

const getStudentGrades = async (studentId, academicYearId, termId = null, classId = null, subjectId = null) => {
  let query = `
    SELECT sg.*, 
           s.first_name || ' ' || s.last_name as student_name,
           sub.name as subject_name,
           gc.name as component_name,
           gc.weight as component_weight,
           u.first_name || ' ' || u.last_name as entered_by_name
    FROM student_grades sg
    JOIN users s ON sg.student_id = s.id
    LEFT JOIN subjects sub ON sg.subject_id = sub.id
    LEFT JOIN grade_components gc ON sg.grade_component_id = gc.id
    LEFT JOIN users u ON sg.entered_by = u.id
    WHERE sg.student_id = $1 AND sg.academic_year_id = $2
  `;
  const params = [studentId, academicYearId];
  
  if (termId) {
    query += ` AND sg.term_id = $${params.length + 1}`;
    params.push(termId);
  }
  if (classId) {
    query += ` AND sg.class_id = $${params.length + 1}`;
    params.push(classId);
  }
  if (subjectId) {
    query += ` AND sg.subject_id = $${params.length + 1}`;
    params.push(subjectId);
  }
  
  query += ` ORDER BY sg.subject_id, sg.grade_component_id`;
  const result = await db.query(query, params);
  return result.rows;
};

const getStudentGradeById = async (id) => {
  const query = `
    SELECT sg.*, 
           s.first_name || ' ' || s.last_name as student_name,
           sub.name as subject_name,
           gc.name as component_name
    FROM student_grades sg
    JOIN users s ON sg.student_id = s.id
    LEFT JOIN subjects sub ON sg.subject_id = sub.id
    LEFT JOIN grade_components gc ON sg.grade_component_id = gc.id
    WHERE sg.id = $1
  `;
  const result = await db.query(query, [id]);
  return result.rows[0];
};

const getSubjectGrades = async (subjectId, classId, academicYearId, termId = null) => {
  let query = `
    SELECT sg.*, 
           s.first_name || ' ' || s.last_name as student_name,
           u.email as student_email
    FROM student_grades sg
    JOIN users s ON sg.student_id = s.id
    LEFT JOIN users u ON sg.student_id = u.id
    WHERE sg.subject_id = $1 AND sg.class_id = $2 AND sg.academic_year_id = $3
  `;
  const params = [subjectId, classId, academicYearId];
  
  if (termId) {
    query += ` AND sg.term_id = $${params.length + 1}`;
    params.push(termId);
  }
  
  query += ` ORDER BY s.last_name, s.first_name`;
  const result = await db.query(query, params);
  return result.rows;
};

const updateStudentGrade = async (id, updates, updatedBy) => {
  const { score, maxScore, remarks, isApproved, approvedBy, isLocked, lockedBy } = updates;
  
  
  let percentage = null;
  let letterGrade = null;
  let gradePoint = null;
  const currentMax = maxScore || (await getStudentGradeById(id))?.max_score || 100;
  const currentScore = score;
  
  if (currentScore !== undefined) {
    percentage = currentMax ? (currentScore / currentMax) * 100 : null;
    if (percentage !== null) {
      const scale = await getGradeScaleByPercentage(percentage);
      if (scale) {
        letterGrade = scale.letter_grade;
        gradePoint = scale.grade_point;
      }
    }
  }

  const query = `
    UPDATE student_grades
    SET score = COALESCE($2, score),
        max_score = COALESCE($3, max_score),
        percentage = $4,
        letter_grade = $5,
        grade_point = $6,
        remarks = COALESCE($7, remarks),
        is_approved = COALESCE($8, is_approved),
        approved_by = COALESCE($9, approved_by),
        approved_at = CASE WHEN $8 = true THEN CURRENT_TIMESTAMP ELSE approved_at END,
        is_locked = COALESCE($10, is_locked),
        locked_at = CASE WHEN $10 = true THEN CURRENT_TIMESTAMP ELSE locked_at END,
        locked_by = COALESCE($11, locked_by),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  const result = await db.query(query, [
    id, score, maxScore, percentage, letterGrade, gradePoint, 
    remarks, isApproved, approvedBy, isLocked, lockedBy
  ]);
  return result.rows[0];
};

const deleteStudentGrade = async (id) => {
  const query = `DELETE FROM student_grades WHERE id = $1 RETURNING *`;
  const result = await db.query(query, [id]);
  return result.rows[0];
};

const approveGrade = async (id, approvedBy) => {
  const query = `
    UPDATE student_grades
    SET is_approved = true, approved_by = $2, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  const result = await db.query(query, [id, approvedBy]);
  return result.rows[0];
};

const lockGrade = async (id, lockedBy) => {
  const query = `
    UPDATE student_grades
    SET is_locked = true, locked_by = $2, locked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  const result = await db.query(query, [id, lockedBy]);
  return result.rows[0];
};

const unlockGrade = async (id) => {
  const query = `
    UPDATE student_grades
    SET is_locked = false, locked_at = NULL, locked_by = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  const result = await db.query(query, [id]);
  return result.rows[0];
};


const generateReportCard = async (data) => {
  const { studentId, classId, academicYearId, termId, generatedBy } = data;
  
  
  const gradesQuery = `
    SELECT sg.*, gc.weight
    FROM student_grades sg
    LEFT JOIN grade_components gc ON sg.grade_component_id = gc.id
    WHERE sg.student_id = $1 AND sg.class_id = $2 AND sg.academic_year_id = $3 AND sg.term_id = $4
      AND sg.is_approved = true
  `;
  const gradesResult = await db.query(gradesQuery, [studentId, classId, academicYearId, termId]);
  const grades = gradesResult.rows;
  
  if (grades.length === 0) {
    return null;
  }
  
  
  let totalWeightedScore = 0;
  let totalWeight = 0;
  let totalRawScore = 0;
  
  for (const grade of grades) {
    const weight = grade.weight || 100;
    if (grade.percentage !== null) {
      totalWeightedScore += grade.percentage * weight;
      totalWeight += weight;
    }
    if (grade.score !== null) {
      totalRawScore += grade.score;
    }
  }
  
  const averagePercentage = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
  
  
  let letterGrade = null;
  let gradePoint = null;
  const scale = await getGradeScaleByPercentage(averagePercentage);
  if (scale) {
    letterGrade = scale.letter_grade;
    gradePoint = scale.grade_point;
  }
  
  
  const subjectCountQuery = `
    SELECT COUNT(DISTINCT subject_id) as count
    FROM student_grades
    WHERE student_id = $1 AND class_id = $2 AND academic_year_id = $3 AND term_id = $4 AND is_approved = true
  `;
  const subjectCountResult = await db.query(subjectCountQuery, [studentId, classId, academicYearId, termId]);
  const subjectCount = parseInt(subjectCountResult.rows[0].count) || 0;
  
  
  const rankQuery = `
    WITH student_averages AS (
      SELECT student_id, 
             SUM(percentage * COALESCE(gc.weight, 100)) / NULLIF(SUM(COALESCE(gc.weight, 100)), 0) as avg_percentage
      FROM student_grades sg
      LEFT JOIN grade_components gc ON sg.grade_component_id = gc.id
      WHERE sg.class_id = $1 AND sg.academic_year_id = $2 AND sg.term_id = $3 AND sg.is_approved = true
      GROUP BY student_id
    )
    SELECT COUNT(*) + 1 as rank
    FROM student_averages
    WHERE avg_percentage > (SELECT avg_percentage FROM student_averages WHERE student_id = $4)
  `;
  const rankResult = await db.query(rankQuery, [classId, academicYearId, termId, studentId]);
  const rank = parseInt(rankResult.rows[0].rank) || null;
  
  const query = `
    INSERT INTO report_cards (
      student_id, class_id, academic_year_id, term_id, average_percentage,
      letter_grade, grade_point, total_score, subject_count, rank, generated_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (student_id, class_id, academic_year_id, term_id)
    DO UPDATE SET 
      average_percentage = EXCLUDED.average_percentage,
      letter_grade = EXCLUDED.letter_grade,
      grade_point = EXCLUDED.grade_point,
      total_score = EXCLUDED.total_score,
      subject_count = EXCLUDED.subject_count,
      rank = EXCLUDED.rank,
      generated_by = EXCLUDED.generated_by,
      generated_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  const result = await db.query(query, [
    studentId, classId, academicYearId, termId, averagePercentage,
    letterGrade, gradePoint, totalRawScore, subjectCount, rank, generatedBy
  ]);
  return result.rows[0];
};

const getReportCard = async (studentId, academicYearId, termId = null) => {
  let query = `
    SELECT rc.*,
           s.first_name || ' ' || s.last_name as student_name,
           c.name as class_name,
           ay.name as academic_year_name,
           t.name as term_name,
           u.first_name || ' ' || u.last_name as generated_by_name
    FROM report_cards rc
    JOIN users s ON rc.student_id = s.id
    JOIN classes c ON rc.class_id = c.id
    JOIN academic_years ay ON rc.academic_year_id = ay.id
    LEFT JOIN terms t ON rc.term_id = t.id
    LEFT JOIN users u ON rc.generated_by = u.id
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

const getClassReportCards = async (classId, academicYearId, termId = null) => {
  let query = `
    SELECT rc.*,
           s.first_name || ' ' || s.last_name as student_name,
           s.email as student_email
    FROM report_cards rc
    JOIN users s ON rc.student_id = s.id
    WHERE rc.class_id = $1 AND rc.academic_year_id = $2
  `;
  const params = [classId, academicYearId];
  
  if (termId) {
    query += ` AND rc.term_id = $3`;
    params.push(termId);
  }
  
  query += ` ORDER BY rc.rank, s.last_name, s.first_name`;
  const result = await db.query(query, params);
  return result.rows;
};

const finalizeReportCard = async (id, finalizedBy) => {
  const query = `
    UPDATE report_cards
    SET is_finalized = true, finalized_by = $2, finalized_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  const result = await db.query(query, [id, finalizedBy]);
  return result.rows[0];
};

const deleteReportCard = async (id) => {
  const query = `DELETE FROM report_cards WHERE id = $1 RETURNING *`;
  const result = await db.query(query, [id]);
  return result.rows[0];
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
  getGradeScaleByPercentage,
  
  
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

