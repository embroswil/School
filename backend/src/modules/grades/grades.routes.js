const express = require("express");
const router = express.Router();
const gradesController = require("./grades.controller");
const authMiddleware = require("../../middlewares/auth.middleware");


router.post("/components", authMiddleware.authenticate, authMiddleware.authorize("admin"), gradesController.createGradeComponent);
router.get("/components/year/:academicYearId", authMiddleware.authenticate, gradesController.getGradeComponentsByYear);
router.get("/components/:id", authMiddleware.authenticate, gradesController.getGradeComponentById);
router.put("/components/:id", authMiddleware.authenticate, authMiddleware.authorize("admin"), gradesController.updateGradeComponent);
router.delete("/components/:id", authMiddleware.authenticate, authMiddleware.authorize("admin"), gradesController.deleteGradeComponent);


router.post("/scales", authMiddleware.authenticate, authMiddleware.authorize("admin"), gradesController.createGradeScale);
router.get("/scales", authMiddleware.authenticate, gradesController.getAllGradeScales);
router.get("/scales/:id", authMiddleware.authenticate, gradesController.getGradeScaleById);
router.put("/scales/:id", authMiddleware.authenticate, authMiddleware.authorize("admin"), gradesController.updateGradeScale);
router.delete("/scales/:id", authMiddleware.authenticate, authMiddleware.authorize("admin"), gradesController.deleteGradeScale);


router.post("/", authMiddleware.authenticate, authMiddleware.authorize("admin", "teacher"), gradesController.createStudentGrade);
router.post("/bulk", authMiddleware.authenticate, authMiddleware.authorize("admin", "teacher"), gradesController.bulkCreateStudentGrades);
router.get("/student/:studentId", authMiddleware.authenticate, gradesController.getStudentGrades);
router.get("/subject/:subjectId/class/:classId", authMiddleware.authenticate, authMiddleware.authorize("admin", "teacher"), gradesController.getSubjectGrades);
router.get("/:id", authMiddleware.authenticate, gradesController.getStudentGradeById);
router.put("/:id", authMiddleware.authenticate, authMiddleware.authorize("admin", "teacher"), gradesController.updateStudentGrade);
router.delete("/:id", authMiddleware.authenticate, authMiddleware.authorize("admin"), gradesController.deleteStudentGrade);

router.post("/:id/approve", authMiddleware.authenticate, authMiddleware.authorize("admin"), gradesController.approveGrade);
router.post("/:id/lock", authMiddleware.authenticate, authMiddleware.authorize("admin"), gradesController.lockGrade);
router.post("/:id/unlock", authMiddleware.authenticate, authMiddleware.authorize("admin"), gradesController.unlockGrade);


router.post("/report-card", authMiddleware.authenticate, authMiddleware.authorize("admin", "teacher"), gradesController.generateReportCard);
router.get("/report-card/student/:studentId", authMiddleware.authenticate, gradesController.getReportCard);
router.get("/report-card/class/:classId", authMiddleware.authenticate, authMiddleware.authorize("admin", "teacher"), gradesController.getClassReportCards);
router.post("/report-card/:id/finalize", authMiddleware.authenticate, authMiddleware.authorize("admin"), gradesController.finalizeReportCard);
router.delete("/report-card/:id", authMiddleware.authenticate, authMiddleware.authorize("admin"), gradesController.deleteReportCard);

module.exports = router;

