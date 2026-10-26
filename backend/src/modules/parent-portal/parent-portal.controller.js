const parentPortalService = require("./parent-portal.service");


const getChildren = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const children = await parentPortalService.getChildrenByParent(parentId);

    res.json({
      success: true,
      data: children
    });
  } catch (error) {
    next(error);
  }
};


const getChildDashboard = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const { studentId } = req.params;
    const { academicYearId, termId } = req.query;

    if (!academicYearId) {
      return res.status(400).json({
        success: false,
        message: "Academic year ID is required"
      });
    }

    const dashboard = await parentPortalService.getChildDashboard(
      parentId,
      parseInt(studentId),
      parseInt(academicYearId),
      termId ? parseInt(termId) : null
    );

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    next(error);
  }
};


const getChildEnrollment = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const { studentId } = req.params;
    const { academicYearId } = req.query;

    if (!academicYearId) {
      return res.status(400).json({
        success: false,
        message: "Academic year ID is required"
      });
    }

    const enrollment = await parentPortalService.getChildEnrollment(
      parentId,
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


const getChildGrades = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const { studentId } = req.params;
    const { academicYearId, termId } = req.query;

    if (!academicYearId) {
      return res.status(400).json({
        success: false,
        message: "Academic year ID is required"
      });
    }

    const grades = await parentPortalService.getChildGrades(
      parentId,
      parseInt(studentId),
      parseInt(academicYearId),
      termId ? parseInt(termId) : null
    );

    res.json({
      success: true,
      data: grades
    });
  } catch (error) {
    next(error);
  }
};


const getChildAttendance = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const { studentId } = req.params;
    const { academicYearId, termId, startDate, endDate } = req.query;

    if (!academicYearId) {
      return res.status(400).json({
        success: false,
        message: "Academic year ID is required"
      });
    }

    const attendance = await parentPortalService.getChildAttendance(
      parentId,
      parseInt(studentId),
      parseInt(academicYearId),
      termId ? parseInt(termId) : null,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: attendance
    });
  } catch (error) {
    next(error);
  }
};


const getChildFees = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const { studentId } = req.params;
    const { academicYearId } = req.query;

    if (!academicYearId) {
      return res.status(400).json({
        success: false,
        message: "Academic year ID is required"
      });
    }

    const fees = await parentPortalService.getChildFees(
      parentId,
      parseInt(studentId),
      parseInt(academicYearId)
    );

    res.json({
      success: true,
      data: fees
    });
  } catch (error) {
    next(error);
  }
};


const getChildPayments = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const { studentId } = req.params;
    const { academicYearId } = req.query;

    const payments = await parentPortalService.getChildPayments(
      parentId,
      parseInt(studentId),
      academicYearId ? parseInt(academicYearId) : null
    );

    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    next(error);
  }
};


const getChildReportCard = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const { studentId } = req.params;
    const { academicYearId, termId } = req.query;

    if (!academicYearId) {
      return res.status(400).json({
        success: false,
        message: "Academic year ID is required"
      });
    }

    const reportCard = await parentPortalService.getChildReportCard(
      parentId,
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


const getChildTimetable = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const { studentId } = req.params;
    const { academicYearId, termId } = req.query;

    if (!academicYearId) {
      return res.status(400).json({
        success: false,
        message: "Academic year ID is required"
      });
    }

    const timetable = await parentPortalService.getChildTimetable(
      parentId,
      parseInt(studentId),
      parseInt(academicYearId),
      termId ? parseInt(termId) : null
    );

    res.json({
      success: true,
      data: timetable
    });
  } catch (error) {
    next(error);
  }
};


const getPreferences = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const prefs = await parentPortalService.getNotificationPreferences(parentId);

    res.json({
      success: true,
      data: prefs
    });
  } catch (error) {
    next(error);
  }
};


const updatePreferences = async (req, res, next) => {
  try {
    const parentId = req.user.id;
    const { emailEnabled, smsEnabled, paymentAlerts, gradeAlerts, attendanceAlerts, announcementAlerts } = req.body;

    const prefs = await parentPortalService.updateNotificationPreferences(parentId, {
      emailEnabled,
      smsEnabled,
      paymentAlerts,
      gradeAlerts,
      attendanceAlerts,
      announcementAlerts
    });

    res.json({
      success: true,
      message: "Preferences updated successfully",
      data: prefs
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getChildren,
  getChildDashboard,
  getChildEnrollment,
  getChildGrades,
  getChildAttendance,
  getChildFees,
  getChildPayments,
  getChildReportCard,
  getChildTimetable,
  getPreferences,
  updatePreferences,
};

