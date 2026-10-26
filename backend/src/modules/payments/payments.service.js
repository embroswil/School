const paymentsSql = require("./payments.sql");
const ApiError = require("../../utils/ApiError");
const paymentGateway = require("../../utils/paymentGateway");
const notificationsService = require("../notifications/notifications.service");


const createFeeStructure = async (data) => {
  const { name, academicYearId, amount } = data;
  
  if (!name || !academicYearId || !amount) {
    throw new ApiError(400, "Name, academic year, and amount are required");
  }
  
  if (amount <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }
  
  return paymentsSql.createFeeStructure(data);
};

const getFeeStructuresByYear = async (academicYearId, activeOnly = false) => {
  return paymentsSql.getFeeStructuresByYear(academicYearId, activeOnly);
};

const getFeeStructureById = async (id) => {
  const fee = await paymentsSql.getFeeStructureById(id);
  if (!fee) {
    throw new ApiError(404, "Fee structure not found");
  }
  return fee;
};

const updateFeeStructure = async (id, updates) => {
  const fee = await paymentsSql.getFeeStructureById(id);
  if (!fee) {
    throw new ApiError(404, "Fee structure not found");
  }
  
  return paymentsSql.updateFeeStructure(id, updates);
};

const deleteFeeStructure = async (id) => {
  const fee = await paymentsSql.getFeeStructureById(id);
  if (!fee) {
    throw new ApiError(404, "Fee structure not found");
  }
  
  return paymentsSql.deleteFeeStructure(id);
};


const assignFeeToStudent = async (data) => {
  const { studentId, feeStructureId, academicYearId, classId } = data;
  
  if (!studentId || !feeStructureId || !academicYearId) {
    throw new ApiError(400, "Student, fee structure, and academic year are required");
  }
  
  
  const feeStructure = await paymentsSql.getFeeStructureById(feeStructureId);
  if (!feeStructure) {
    throw new ApiError(404, "Fee structure not found");
  }
  
  return paymentsSql.createStudentFee({
    studentId,
    feeStructureId,
    academicYearId,
    classId,
    amount: feeStructure.amount,
    dueDate: feeStructure.due_date
  });
};

const assignFeeToClass = async (feeStructureId, classId, academicYearId) => {
  
  const classSql = require("../classes/class.sql");
  const classStudents = await classSql.getClassStudents(classId, academicYearId);
  
  if (!classStudents || classStudents.length === 0) {
    throw new ApiError(400, "No students found in this class");
  }
  
  const fees = [];
  for (const student of classStudents) {
    const fee = await assignFeeToStudent({
      studentId: student.student_id,
      feeStructureId,
      academicYearId,
      classId
    });
    if (fee) fees.push(fee);
  }
  
  return fees;
};

const getStudentFees = async (studentId, academicYearId = null) => {
  return paymentsSql.getStudentFees(studentId, academicYearId);
};

const getClassFees = async (classId, academicYearId) => {
  return paymentsSql.getClassFees(classId, academicYearId);
};

const updateStudentFee = async (id, updates) => {
  const fee = await paymentsSql.getFeeById(id);
  if (!fee) {
    throw new ApiError(404, "Student fee not found");
  }
  
  return paymentsSql.updateStudentFee(id, updates);
};


const createPayment = async (data) => {
  const { studentFeeId, studentId, amount, paymentMethod, transactionId, phoneNumber } = data;
  
  if (!studentFeeId || !studentId || !amount) {
    throw new ApiError(400, "Student fee, student, and amount are required");
  }
  
  if (amount <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }
  
  
  const studentFee = await paymentsSql.getFeeById(studentFeeId);
  if (!studentFee) {
    throw new ApiError(404, "Student fee not found");
  }
  
  
  if (transactionId) {
    const existing = await paymentsSql.getPaymentByTransactionId(transactionId);
    if (existing) {
      return existing;
    }
  }
  
  
  const payment = await paymentsSql.createPayment({
    studentFeeId,
    studentId,
    amount,
    paymentMethod,
    transactionId,
    phoneNumber,
    status: 'pending'
  });
  
  
  if (paymentMethod === 'cash' || paymentMethod === 'bank_transfer') {
    return completePayment(payment.id);
  }
  
  return payment;
};

const completePayment = async (paymentId) => {
  const payment = await paymentsSql.getPaymentById(paymentId);
  if (!payment) {
    throw new ApiError(404, "Payment not found");
  }
  
  if (payment.status === 'completed') {
    return payment;
  }
  
  
  await paymentsSql.updatePaymentStatus(paymentId, 'completed');
  
  
  const studentFee = await paymentsSql.getFeeById(payment.student_fee_id);
  const newPaidAmount = (parseFloat(studentFee.paid_amount) || 0) + parseFloat(payment.amount);
  const newBalance = parseFloat(studentFee.amount) - newPaidAmount;
  
  let newStatus = 'partial';
  if (newBalance <= 0) {
    newStatus = 'paid';
  }
  
  await paymentsSql.updateStudentFee(payment.student_fee_id, {
    paidAmount: newPaidAmount,
    status: newStatus
  });
  
  return paymentsSql.getPaymentById(paymentId);
};

const getPaymentById = async (id) => {
  const payment = await paymentsSql.getPaymentById(id);
  if (!payment) {
    throw new ApiError(404, "Payment not found");
  }
  return payment;
};

const getPaymentsByStudent = async (studentId, academicYearId = null) => {
  return paymentsSql.getPaymentsByStudent(studentId, academicYearId);
};


const handlePaymentCallback = async (data) => {
  const { transactionId, status, amount, phoneNumber, gatewayResponse } = data;
  
  if (!transactionId || !status || !amount) {
    throw new ApiError(400, "Transaction ID, status, and amount are required");
  }
  
  const result = await paymentsSql.processPaymentCallback(
    transactionId,
    status,
    amount,
    phoneNumber,
    JSON.stringify(gatewayResponse)
  );
  
  if (result && !result.existing && result.payment && status === 'completed') {
    
    
  }
  
  return result;
};


const getFeeCollectionReport = async (academicYearId, classId = null, termId = null) => {
  if (!academicYearId) {
    throw new ApiError(400, "Academic year ID is required");
  }
  
  const report = await paymentsSql.getFeeCollectionReport(academicYearId, classId, termId);
  
  
  const totals = report.reduce((acc, item) => {
    acc.totalExpected += parseFloat(item.total_expected) || 0;
    acc.totalCollected += parseFloat(item.total_collected) || 0;
    acc.totalBalance += parseFloat(item.total_balance) || 0;
    return acc;
  }, { totalExpected: 0, totalCollected: 0, totalBalance: 0 });
  
  totals.collectionRate = totals.totalExpected > 0 
    ? ((totals.totalCollected / totals.totalExpected) * 100).toFixed(2) 
    : 0;
  
  return { details: report, totals };
};

const createReconciliation = async (data, preparedBy) => {
  const { academicYearId, reconciliationDate, totalExpected, totalCollected, totalPending, totalRefunded, notes } = data;
  
  if (!academicYearId || !reconciliationDate) {
    throw new ApiError(400, "Academic year and reconciliation date are required");
  }
  
  return paymentsSql.createReconciliation({
    ...data,
    preparedBy
  });
};

const getReconciliations = async (academicYearId) => {
  return paymentsSql.getReconciliations(academicYearId);
};




const initializePaystackPayment = async (data) => {
  const { studentFeeId, email, callbackUrl } = data;
  
  if (!studentFeeId || !email) {
    throw new ApiError(400, "Student fee ID and email are required");
  }
  
  
  const studentFee = await paymentsSql.getFeeById(studentFeeId);
  if (!studentFee) {
    throw new ApiError(404, "Student fee not found");
  }
  
  const balance = parseFloat(studentFee.amount) - parseFloat(studentFee.paid_amount || 0);
  if (balance <= 0) {
    throw new ApiError(400, "This fee has already been fully paid");
  }
  
  
  const userSql = require("../users/user.sql");
  const student = await userSql.findUserById(studentFee.student_id);
  
  
  const paymentResponse = await paymentGateway.initializePayment({
    email,
    amount: balance,
    studentId: studentFee.student_id,
    studentFeeId,
    callbackUrl
  });
  
  
  const payment = await paymentsSql.createPayment({
    studentFeeId,
    studentId: studentFee.student_id,
    amount: balance,
    paymentMethod: 'paystack',
    transactionId: paymentResponse.reference,
    phoneNumber: student?.phone,
    status: 'pending'
  });
  
  return {
    payment: {
      id: payment.id,
      amount: payment.amount,
      status: payment.status,
      transactionId: payment.transaction_id
    },
    authorizationUrl: paymentResponse.authorizationUrl,
    reference: paymentResponse.reference
  };
};


const chargeMobileMoneyPayment = async (data) => {
  const { studentFeeId, email, phoneNumber, amount } = data;
  
  if (!email || !phoneNumber) {
    throw new ApiError(400, "Email and phone number are required");
  }
  
  if (!amount || amount <= 0) {
    throw new ApiError(400, "Valid amount is required");
  }
  
  let paymentAmount = amount;
  let studentId = null;
  let studentFeeIdFinal = null;
  
  
  if (studentFeeId) {
    const studentFee = await paymentsSql.getFeeById(studentFeeId);
    if (!studentFee) {
      throw new ApiError(404, "Student fee not found");
    }
    
    paymentAmount = amount || (parseFloat(studentFee.amount) - parseFloat(studentFee.paid_amount || 0));
    studentId = studentFee.student_id;
    studentFeeIdFinal = studentFeeId;
    
    if (paymentAmount <= 0) {
      throw new ApiError(400, "This fee has already been fully paid");
    }
  }
  
  
  const paymentResponse = await paymentGateway.chargeMobileMoney({
    email,
    phoneNumber,
    amount: paymentAmount,
    studentId: studentId || 0,
    studentFeeId: studentFeeIdFinal || 0
  });
  
  
  const payment = await paymentsSql.createPayment({
    studentFeeId: studentFeeIdFinal || null,
    studentId: studentId || null,
    amount: paymentAmount,
    paymentMethod: 'mobile_money',
    transactionId: paymentResponse.reference,
    phoneNumber,
    status: 'pending'
  });
  
  return {
    payment: {
      id: payment.id,
      amount: payment.amount,
      status: payment.status,
      transactionId: payment.transaction_id
    },
    reference: paymentResponse.reference,
    message: paymentResponse.message || 'Payment initiated. Please check your phone to approve.',
    requiresApproval: paymentResponse.requiresApproval
  };
};


const verifyPaystackPayment = async (reference) => {
  
  const verification = await paymentGateway.verifyTransaction(reference);
  
  if (!verification.verified) {
    throw new ApiError(400, "Payment verification failed");
  }
  
  
  const payment = await paymentsSql.getPaymentByTransactionId(reference);
  if (!payment) {
    throw new ApiError(404, "Payment record not found");
  }
  
  if (payment.status === 'completed') {
    return payment;
  }
  
  
  return completePayment(payment.id);
};


const handlePaystackWebhook = async (payload) => {
  const webhookEvent = await paymentGateway.handleWebhook('charge.success', payload);
  
  if (webhookEvent.event === 'payment_success') {
    const { reference, amount, metadata } = webhookEvent;
    
    
    const payment = await paymentsSql.getPaymentByTransactionId(reference);
    
    if (payment && payment.status !== 'completed') {
      
      await completePayment(payment.id);
      
      
      try {
        const userSql = require("../users/user.sql");
        const student = await userSql.findUserById(payment.student_id);
        
        
        const parentLinks = await userSql.getParentsByStudent(payment.student_id);
        
        for (const link of parentLinks) {
          await notificationsService.notifyPayment(
            payment.student_id,
            link.parent_id,
            amount,
            'completed'
          );
        }
      } catch (error) {
        console.error('Failed to send payment notification:', error);
      }
    }
  }
  
  return { received: true };
};


const createPaystackPaymentLink = async (data) => {
  const { studentFeeId, title, description } = data;
  
  if (!studentFeeId) {
    throw new ApiError(400, "Student fee ID is required");
  }
  
  const studentFee = await paymentsSql.getFeeById(studentFeeId);
  if (!studentFee) {
    throw new ApiError(404, "Student fee not found");
  }
  
  const balance = parseFloat(studentFee.amount) - parseFloat(studentFee.paid_amount || 0);
  
  const response = await paymentGateway.createPaymentLink({
    title: title || 'School Fee Payment',
    description: description || `Fee payment for ${studentFee.student_name || 'student'}`,
    amount: balance,
    studentId: studentFee.student_id,
    studentFeeId
  });
  
  return response;
};

module.exports = {
  
  createFeeStructure,
  getFeeStructuresByYear,
  getFeeStructureById,
  updateFeeStructure,
  deleteFeeStructure,
  
  
  assignFeeToStudent,
  assignFeeToClass,
  getStudentFees,
  getClassFees,
  updateStudentFee,
  
  
  createPayment,
  completePayment,
  getPaymentById,
  getPaymentsByStudent,
  handlePaymentCallback,
  
  
  getFeeCollectionReport,
  createReconciliation,
  getReconciliations,
  
  
  initializePaystackPayment,
  chargeMobileMoneyPayment,
  verifyPaystackPayment,
  handlePaystackWebhook,
  createPaystackPaymentLink,
};

