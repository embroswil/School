const express = require("express");
const router = express.Router();
const userController = require("./user.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

router.use(authMiddleware.authenticate, authMiddleware.authorize("admin"));

router.get("/", userController.listUsers);
router.post("/", userController.createUser);
router.get("/:id", userController.getUser);
router.put("/:id", userController.updateUser);
router.patch("/:id/status", userController.setUserStatus);

module.exports = router;
