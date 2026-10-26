const express = require("express");
const router = express.Router();
const studentsController = require("./students.controller");
const authMiddleware = require("../../middlewares/auth.middleware");


router.post("/records", authMiddleware.authenticate, authMiddleware.authorize("admin"), studentsController.createStudentRecord);
router.get("/records/id/:id", authMiddleware.authenticate, studentsController.getStudentRecordById);
router.get("/records/student/:studentId", authMiddleware.authenticate, studentsController.getStudentRecordByStudentId);
router.get("/records/admission/:admissionNumber", authMiddleware.authenticate, studentsController.getStudentRecordByAdmissionNumber);
router.put("/records/:id", authMiddleware.authenticate, authMiddleware.authorize("admin"), studentsController.updateStudentRecord);
router.delete("/records/:id", authMiddleware.authenticate, authMiddleware.authorize("admin"), studentsController.deleteStudentRecord);


router.get("/", authMiddleware.authenticate, studentsController.getAllStudents);
router.get("/not-in-class/:classId/:academicYearId", authMiddleware.authenticate, authMiddleware.authorize("admin"), studentsController.getStudentsNotInClass);
router.get("/:studentId/enrollment", authMiddleware.authenticate, studentsController.getStudentCurrentEnrollment);
router.get("/:studentId/enrollment-history", authMiddleware.authenticate, studentsController.getStudentEnrollmentHistory);

router.post("/:studentId/transfer", authMiddleware.authenticate, authMiddleware.authorize("admin"), studentsController.transferStudent);
router.put("/:studentId/status", authMiddleware.authenticate, authMiddleware.authorize("admin"), studentsController.updateStudentClassStatus);

module.exports = router;

