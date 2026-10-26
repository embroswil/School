const db = require("../../config/db");


const createFeeStructure = async (data) => {
  const { name, description, academicYearId, amount, isRecurring, dueDate, category, isActive } = data;
  const query = `
    INSERT INTO fee_structures (name, description, academic_year_id, amount, is_recurring, due_date, category, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
  const result = await db.query(query, [name, description, academicYearId, amount, isRecurring, dueDate, category, isActive !== false]);
  return result.rows[0];
};

const getFeeStructuresByYear = async (academicYearId, activeOnly = false) => {
  let query = `SELECT * FROM fee_structures WHERE academic_year_id = $1`;
  if (activeOnly) {
    query += ` AND is_active = true`;
  }
  query += ` ORDER BY due_date, name`;
  const result = await db.query(query, [academicYearId]);
  return result.rows;
};

const getFeeStructureById = async (id) => {
  const query = `SELECT * FROM fee_structures WHERE id = $1`;
  const result = await db.query(query, [id]);
  return result.rows[0];
};

const updateFeeStructure = async (id, updates) => {
  const { name, description, amount, isRecurring, dueDate, category, isActive } = updates;
  const query = `
    UPDATE fee_structures
    SET name = COALESCE($2, name),
        description = COALESCE($3, description),
        amount = COALESCE($4, amount),
        is_recurring = COALESCE($5, is_recurring),
        due_date = COALESCE($6, due_date),
        category = COALESCE($7, category),
        is_active = COALESCE($8, is_active),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  const result = await db.query(query, [id, name, description, amount, isRecurring, dueDate, category, isActive]);
  return result.rows[0];
};

const deleteFeeStructure = async (id) => {
  const query = `DELETE FROM fee_structures WHERE id = $1 RETURNING *`;
  const result = await db.query(query, [id]);
  return result.rows[0];
};


const createStudentFee = async (data) => {
  const { studentId, feeStructureId, academicYearId, classId, amount, dueDate } = data;
  const query = `
    INSERT INTO student_fees (student_id, fee_structure_id, academic_year_id, class_id, amount, due_date)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (student_id, fee_structure_id, academic_year_id)
    DO NOTHING
    RETURNING *
  `;
  const result = await db.query(query, [studentId, feeStructureId, academicYearId, classId, amount, dueDate]);
  return result.rows[0];
};

const bulkCreateStudentFees = async (feesData) => {
  const results = [];
  for (const feeData of feesData) {
    const result = await createStudentFee(feeData);
    if (result) results.push(result);
  }
  return results;
};

const getStudentFees = async (studentId, academicYearId = null) => {
  let query = `
    SELECT sf.*, fs.name as fee_name, fs.category, fs.description as fee_description, fs.amount as structure_amount,
           c.name as class_name
    FROM student_fees sf
    JOIN fee_structures fs ON sf.fee_structure_id = fs.id
    LEFT JOIN classes c ON sf.class_id = c.id
    WHERE sf.student_id = $1
  `;
  const params = [studentId];
  
  if (academicYearId) {
    query += ` AND sf.academic_year_id = $2`;
    params.push(academicYearId);
  }
  
  query += ` ORDER BY sf.due_date, fs.name`;
  const result = await db.query(query, params);
  return result.rows;
};

const getClassFees = async (classId, academicYearId) => {
  const query = `
    SELECT sf.*, u.first_name, u.last_name, u.email, fs.name as fee_name, fs.category
    FROM student_fees sf
    JOIN fee_structures fs ON sf.fee_structure_id = fs.id
    JOIN users u ON sf.student_id = u.id
    WHERE sf.class_id = $1 AND sf.academic_year_id = $2
    ORDER BY u.last_name, u.first_name
  `;
  const result = await db.query(query, [classId, academicYearId]);
  return result.rows;
};

const getFeeById = async (id) => {
  const query = `
    SELECT sf.*, fs.name as fee_name, fs.category, fs.description as fee_description,
           u.first_name, u.last_name, u.email
    FROM student_fees sf
    JOIN fee_structures fs ON sf.fee_structure_id = fs.id
    JOIN users u ON sf.student_id = u.id
    WHERE sf.id = $1
  `;
  const result = await db.query(query, [id]);
  return result.rows[0];
};

const updateStudentFee = async (id, updates) => {
  const { amount, paidAmount, dueDate, status, paymentMethod, notes } = updates;
  const query = `
    UPDATE student_fees
    SET amount = COALESCE($2, amount),
        paid_amount = COALESCE($3, paid_amount),
        balance = amount - COALESCE($3, paid_amount),
        due_date = COALESCE($4, due_date),
        status = COALESCE($5, status),
        payment_method = COALESCE($6, payment_method),
        notes = COALESCE($7, notes),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  const result = await db.query(query, [id, amount, paidAmount, dueDate, status, paymentMethod, notes]);
  return result.rows[0];
};


const createPayment = async (data) => {
  const { studentFeeId, studentId, amount, paymentMethod, transactionId, phoneNumber, status } = data;
  
  
  const receiptQuery = `SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 6 FOR 10) AS INTEGER)), 0) + 1 as next_num FROM payments`;
  const receiptResult = await db.query(receiptQuery);
  const receiptNumber = `RCP${String(receiptResult.rows[0].next_num).padStart(7, '0')}`;
  
  const query = `
    INSERT INTO payments (student_fee_id, student_id, amount, payment_method, transaction_id, phone_number, status, receipt_number)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
  const result = await db.query(query, [studentFeeId, studentId, amount, paymentMethod, transactionId, phoneNumber, status || 'pending', receiptNumber]);
  return result.rows[0];
};

const getPaymentById = async (id) => {
  const query = `
    SELECT p.*, sf.fee_structure_id, fs.name as fee_name, 
           u.first_name as student_first_name, u.last_name as student_last_name
    FROM payments p
    LEFT JOIN student_fees sf ON p.student_fee_id = sf.id
    LEFT JOIN fee_structures fs ON sf.fee_structure_id = fs.id
    LEFT JOIN users u ON p.student_id = u.id
    WHERE p.id = $1
  `;
  const result = await db.query(query, [id]);
  return result.rows[0];
};

const getPaymentByTransactionId = async (transactionId) => {
  const query = `SELECT * FROM payments WHERE transaction_id = $1`;
  const result = await db.query(query, [transactionId]);
  return result.rows[0];
};

const getPaymentsByStudent = async (studentId, academicYearId = null) => {
  let query = `
    SELECT p.*, sf.fee_structure_id, fs.name as fee_name
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

const updatePaymentStatus = async (id, status, gatewayResponse = null) => {
  const query = `
    UPDATE payments
    SET status = $2, 
        gateway_response = COALESCE($3, gateway_response),
        processed_at = CASE WHEN $2 = 'completed' THEN CURRENT_TIMESTAMP ELSE processed_at END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  const result = await db.query(query, [id, status, gatewayResponse]);
  return result.rows[0];
};


const processPaymentCallback = async (transactionId, status, amount, phoneNumber, gatewayResponse) => {
  
  const existing = await getPaymentByTransactionId(transactionId);
  
  if (existing) {
    if (existing.callback_received) {
      return { existing: true, payment: existing }; 
    }
    
    
    const updated = await updatePaymentStatus(existing.id, status, gatewayResponse);
    
    
    if (status === 'completed') {
      await updateStudentFee(existing.student_fee_id, {
        paidAmount: existing.amount
      });
    }
    
    return { existing: false, payment: updated };
  }
  
  
  
  return null;
};


const getFeeCollectionReport = async (academicYearId, classId = null, termId = null) => {
  let query = `
    SELECT 
      fs.category,
      fs.name as fee_name,
      COUNT(DISTINCT sf.id) as total_students,
      SUM(sf.amount) as total_expected,
      SUM(sf.paid_amount) as total_collected,
      SUM(sf.balance) as total_balance,
      SUM(CASE WHEN sf.status = 'paid' THEN 1 ELSE 0 END) as fully_paid,
      SUM(CASE WHEN sf.status = 'partial' THEN 1 ELSE 0 END) as partially_paid,
      SUM(CASE WHEN sf.status IN ('unpaid', 'overdue') THEN 1 ELSE 0 END) as unpaid
    FROM student_fees sf
    JOIN fee_structures fs ON sf.fee_structure_id = fs.id
    WHERE sf.academic_year_id = $1
  `;
  const params = [academicYearId];
  
  if (classId) {
    query += ` AND sf.class_id = $2`;
    params.push(classId);
  }
  
  if (termId) {
    query += ` AND sf.term_id = $${params.length + 1}`;
    params.push(termId);
  }
  
  query += ` GROUP BY fs.category, fs.name ORDER BY fs.category, fs.name`;
  const result = await db.query(query, params);
  return result.rows;
};


const createReconciliation = async (data) => {
  const { academicYearId, reconciliationDate, totalExpected, totalCollected, totalPending, totalRefunded, preparedBy, notes } = data;
  const query = `
    INSERT INTO payment_reconciliations (academic_year_id, reconciliation_date, total_expected, total_collected, total_pending, total_refunded, prepared_by, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
  const result = await db.query(query, [academicYearId, reconciliationDate, totalExpected, totalCollected, totalPending, totalRefunded, preparedBy, notes]);
  return result.rows[0];
};

const getReconciliations = async (academicYearId) => {
  const query = `
    SELECT pr.*, u.first_name || ' ' || u.last_name as prepared_by_name
    FROM payment_reconciliations pr
    LEFT JOIN users u ON pr.prepared_by = u.id
    WHERE pr.academic_year_id = $1
    ORDER BY pr.reconciliation_date DESC
  `;
  const result = await db.query(query, [academicYearId]);
  return result.rows;
};

module.exports = {
  
  createFeeStructure,
  getFeeStructuresByYear,
  getFeeStructureById,
  updateFeeStructure,
  deleteFeeStructure,
  
  
  createStudentFee,
  bulkCreateStudentFees,
  getStudentFees,
  getClassFees,
  getFeeById,
  updateStudentFee,
  
  
  createPayment,
  getPaymentById,
  getPaymentByTransactionId,
  getPaymentsByStudent,
  updatePaymentStatus,
  processPaymentCallback,
  
  
  getFeeCollectionReport,
  
  
  createReconciliation,
  getReconciliations,
};

