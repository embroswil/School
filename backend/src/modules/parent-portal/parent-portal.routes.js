const express = require("express");
const router = express.Router();
const parentPortalController = require("./parent-portal.controller");
const authMiddleware = require("../../middlewares/auth.middleware");


router.use(authMiddleware.authenticate);
router.use(authMiddleware.authorize("parent"));


router.get("/children", parentPortalController.getChildren);


router.get("/children/:studentId/dashboard", parentPortalController.getChildDashboard);


router.get("/children/:studentId/enrollment", parentPortalController.getChildEnrollment);
router.get("/children/:studentId/grades", parentPortalController.getChildGrades);
router.get("/children/:studentId/attendance", parentPortalController.getChildAttendance);
router.get("/children/:studentId/fees", parentPortalController.getChildFees);
router.get("/children/:studentId/payments", parentPortalController.getChildPayments);
router.get("/children/:studentId/report-card", parentPortalController.getChildReportCard);
router.get("/children/:studentId/timetable", parentPortalController.getChildTimetable);


router.get("/preferences", parentPortalController.getPreferences);
router.put("/preferences", parentPortalController.updatePreferences);

module.exports = router;

