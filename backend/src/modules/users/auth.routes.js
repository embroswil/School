const express = require("express");
const router = express.Router();
const userController = require("./user.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

router.post("/login", userController.login);
router.post("/refresh", userController.refresh);

router.post("/logout", authMiddleware.authenticate, userController.logout);
router.get("/me", authMiddleware.authenticate, userController.me);
router.post("/change-password", authMiddleware.authenticate, userController.changePassword);

// L'inscription publique est désactivée : seul un admin crée des comptes.
router.post("/register", authMiddleware.authenticate, authMiddleware.authorize("admin"), userController.createUser);

module.exports = router;
