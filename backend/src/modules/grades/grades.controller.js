const gradesService = require("./grades.service");


const createGradeComponent = async (req, res, next) => {
  try {
    const { name, description, weight, academicYearId, isActive } = req.body;
    
    const component = await gradesService.createGradeComponent({
      name,
      description,
      weight,
      academicYearId: parseInt(academicYearId),
      isActive
    });

    res.status(201).json({
      success: true,
      message: "Grade component created successfully",
      data: component
    });
  } catch (error) {
    next(error);
  }
};

const getGradeComponentsByYear = async (req, res, next) => {
  try {
    const { academicYearId } = req.params;
    const { activeOnly = false } = req.query;

    const components = await gradesService.getGradeComponentsByYear(
      parseInt(academicYearId),
      activeOnly !== "false"
    );

    res.json({
      success: true,
      data: components
    });
  } catch (error) {
    next(error);
  }
};

const getGradeComponentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const component = await gradesService.getGradeComponentById(parseInt(id));

    res.json({
      success: true,
      data: component
    });
  } catch (error) {
    next(error);
  }
};

const updateGradeComponent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, weight, isActive } = req.body;

    const component = await gradesService.updateGradeComponent(parseInt(id), {
      name,
      description,
      weight,
      isActive
    });

    res.json({
      success: true,
      message: "Grade component updated successfully",
      data: component
    });
  } catch (error) {
    next(error);
  }
};

const deleteGradeComponent = async (req, res, next) => {
  try {
    const { id } = req.params;
    await gradesService.deleteGradeComponent(parseInt(id));

    res.json({
      success: true,
      message: "Grade component deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};


const createGradeScale = async (req, res, next) => {
  try {
    const { letterGrade, minPercentage, maxPercentage, gradePoint, description, isActive } = req.body;

    const scale = await gradesService.createGradeScale({
      letterGrade,
      minPercentage: parseFloat(minPercentage),
      maxPercentage: parseFloat(maxPercentage),
      gradePoint: gradePoint ? parseFloat(gradePoint) : null,
      description,
      isActive
    });

    res.status(201).json({
      success: true,
      message: "Grade scale created successfully",
      data: scale
    });
  } catch (error) {
    next(error);
  }
};

const getAllGradeScales = async (req, res, next) => {
  try {
    const { activeOnly = false } = req.query;
    const scales = await gradesService.getAllGradeScales(activeOnly !== "false");

    res.json({
      success: true,
      data: scales
    });
  } catch (error) {
    next(error);
  }
};

const getGradeScaleById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const scale = await gradesService.getGradeScaleById(parseInt(id));

    res.json({
      success: true,
      data: scale
    });
  } catch (error) {
    next(error);
  }
};

const updateGradeScale = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { letterGrade, minPercentage, maxPercentage, gradePoint, description, isActive } = req.body;

    const scale = await gradesService.updateGradeScale(parseInt(id), {
      letterGrade,
      minPercentage: minPercentage ? parseFloat(minPercentage) : undefined,
      maxPercentage: maxPercentage ? parseFloat(maxPercentage) : undefined,
      gradePoint: gradePoint ? parseFloat(gradePoint) : undefined,
      description,
      isActive
    });

    res.json({
      success: true,
      message: "Grade scale updated successfully",
      data: scale
    });
  } catch (error) {
    next(error);
  }
};

const deleteGradeScale = async (req, res, next) => {
  try {
    const { id } = req.params;
    await gradesService.deleteGradeScale(parseInt(id));

    res.json({
      success: true,
      message: "Grade scale deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};


const createStudentGrade = async (req, res, next) => {
  try {
    const { studentId, classId, subjectId, academicYearId, termId, gradeComponentId, score, maxScore, remarks } = req.body;
    const enteredBy = req.user.id;

    const grade = await gradesService.createStudentGrade({
      studentId: parseInt(studentId),
      classId: parseInt(classId),
      subjectId: parseInt(subjectId),
      academicYearId: parseInt(academicYearId),
      termId: termId ? parseInt(termId) : null,
      gradeComponentId: gradeComponentId ? parseInt(gradeComponentId) : null,
      score: parseFloat(score),
      maxScore: maxScore ? parseFloat(maxScore) : 100,
      remarks
    }, { id: enteredBy, role: req.user.role });

    res.status(201).json({
      success: true,
      message: "Grade created successfully",
      data: grade
    });
  } catch (error) {
    next(error);
  }
};

const bulkCreateStudentGrades = async (req, res, next) => {
  try {
    const { grades } = req.body;
    const enteredBy = req.user.id;

    const results = await gradesService.bulkCreateStudentGrades(grades, { id: enteredBy, role: req.user.role });

    res.status(201).json({
      success: true,
      message: `${results.length} grades created successfully`,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

const getStudentGrades = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { academicYearId, termId, classId, subjectId } = req.query;

    const grades = await gradesService.getStudentGrades(
      parseInt(studentId),
      academicYearId ? parseInt(academicYearId) : null,
      termId ? parseInt(termId) : null,
      classId ? parseInt(classId) : null,
      subjectId ? parseInt(subjectId) : null
    );

    res.json({
      success: true,
      data: grades
    });
  } catch (error) {
    next(error);
  }
};

const getStudentGradeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const grade = await gradesService.getStudentGradeById(parseInt(id));

    res.json({
      success: true,
      data: grade
    });
  } catch (error) {
    next(error);
  }
};

const getSubjectGrades = async (req, res, next) => {
  try {
    const { subjectId, classId } = req.params;
    const { academicYearId, termId } = req.query;

    const grades = await gradesService.getSubjectGrades(
      parseInt(subjectId),
      parseInt(classId),
      parseInt(academicYearId),
      termId ? parseInt(termId) : null,
      req.user.id
    );

    res.json({
      success: true,
      data: grades
    });
  } catch (error) {
    next(error);
  }
};

const updateStudentGrade = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { score, maxScore, remarks, isApproved, isLocked } = req.body;

    const grade = await gradesService.updateStudentGrade(parseInt(id), {
      score: score ? parseFloat(score) : undefined,
      maxScore: maxScore ? parseFloat(maxScore) : undefined,
      remarks,
      isApproved,
      isLocked,
      approvedBy: isApproved ? req.user.id : undefined,
      lockedBy: isLocked ? req.user.id : undefined
    }, req.user);

    res.json({
      success: true,
      message: "Grade updated successfully",
      data: grade
    });
  } catch (error) {
    next(error);
  }
};

const deleteStudentGrade = async (req, res, next) => {
  try {
    const { id } = req.params;
    await gradesService.deleteStudentGrade(parseInt(id));

    res.json({
      success: true,
      message: "Grade deleted successfully"
    });
  } catch (error) {
    next(error);
  }
};

const approveGrade = async (req, res, next) => {
  try {
    const { id } = req.params;
    const grade = await gradesService.approveGrade(parseInt(id), req.user.id);

    res.json({
      success: true,
      message: "Grade approved successfully",
      data: grade
    });
  } catch (error) {
    next(error);
  }
};

const lockGrade = async (req, res, next) => {
  try {
    const { id } = req.params;
    const grade = await gradesService.lockGrade(parseInt(id), req.user.id);

    res.json({
      success: true,
      message: "Grade locked successfully",
      data: grade
    });
  } catch (error) {
    next(error);
  }
};

const unlockGrade = async (req, res, next) => {
  try {
    const { id } = req.params;
    const grade = await gradesService.unlockGrade(parseInt(id));

    res.json({
      success: true,
      message: "Grade unlocked successfully",
      data: grade
    });
  } catch (error) {
    next(error);
  }
};


const generateReportCard = async (req, res, next) => {
  try {
    const { studentId, classId, academicYearId, termId } = req.body;
    const generatedBy = req.user.id;

    const reportCard = await gradesService.generateReportCard({
      studentId: parseInt(studentId),
      classId: parseInt(classId),
      academicYearId: parseInt(academicYearId),
      termId: parseInt(termId)
    }, generatedBy);

    res.status(201).json({
      success: true,
      message: "Report card generated successfully",
      data: reportCard
    });
  } catch (error) {
    next(error);
  }
};

const getReportCard = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { academicYearId, termId } = req.query;

    const reportCard = await gradesService.getReportCard(
      parseInt(studentId),
      parseInt(academicYearId),
      termId ? parseInt(termId) : null
    );

    res.json({
      success: true,
      data: reportCard
    });
  } catch (error) {
    next(error);
  }
};

const getClassReportCards = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { academicYearId, termId } = req.query;

    const reportCards = await gradesService.getClassReportCards(
      parseInt(classId),
      parseInt(academicYearId),
      termId ? parseInt(termId) : null
    );

    res.json({
      success: true,
      data: reportCards
    });
  } catch (error) {
    next(error);
  }
};

const finalizeReportCard = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reportCard = await gradesService.finalizeReportCard(parseInt(id), req.user.id);

    res.json({
      success: true,
      message: "Report card finalized successfully",
      data: reportCard
    });
  } catch (error) {
    next(error);
  }
};

const deleteReportCard = async (req, res, next) => {
  try {
    const { id } = req.params;
    await gradesService.deleteReportCard(parseInt(id));

    res.json({
      success: true,
      message: "Report card deleted successfully"
    });
  } catch (error) {
    next(error);
  }
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

