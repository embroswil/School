const userService = require("./user.service");
const ApiError = require("../../utils/ApiError");

const clientInfo = (req) => ({ ip: req.ip, userAgent: req.get("user-agent") });

const parseId = (value) => {
  const id = parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid user id");
  return id;
};

// --- /api/auth ---------------------------------------------------------------

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const data = await userService.login({ email, password, ...clientInfo(req) });
    res.json({ success: true, message: "Login successful", data });
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    const data = await userService.refresh({ refreshToken, ...clientInfo(req) });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    await userService.logout({ userId: req.user.id, refreshToken });
    res.json({ success: true, message: "Logged out" });
  } catch (error) {
    next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const data = await userService.getProfile(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    await userService.changePassword({
      userId: req.user.id,
      currentPassword,
      newPassword,
      ...clientInfo(req),
    });
    res.json({ success: true, message: "Password changed. Please log in again." });
  } catch (error) {
    next(error);
  }
};

// --- /api/users (admin) ------------------------------------------------------

const createUser = async (req, res, next) => {
  try {
    const data = await userService.createUser(req.body || {});
    res.status(201).json({ success: true, message: "User created successfully", data });
  } catch (error) {
    next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const { role, isActive, search, status, page, limit } = req.query;
    const { users, meta } = await userService.listUsers({ role, isActive, search, status, page, limit });
    res.json({ success: true, data: users, meta });
  } catch (error) {
    next(error);
  }
};

const getUser = async (req, res, next) => {
  try {
    const data = await userService.getUser(parseId(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const data = await userService.updateUser(parseId(req.params.id), req.body || {}, req.user.id);
    res.json({ success: true, message: "User updated successfully", data });
  } catch (error) {
    next(error);
  }
};

const setUserStatus = async (req, res, next) => {
  try {
    const { isActive } = req.body || {};
    const data = await userService.setUserActive(parseId(req.params.id), isActive, req.user.id);
    res.json({ success: true, message: "User status updated", data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  refresh,
  logout,
  me,
  changePassword,
  createUser,
  listUsers,
  getUser,
  updateUser,
  setUserStatus,
};
