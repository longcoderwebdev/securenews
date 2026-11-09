const router = require('express').Router();
const authController = require('../controllers/authController');
const { requireGuest, requireLogin } = require('../middlewares/auth');
const { registerRules, loginRules } = require('../middlewares/validators');
const { loginLimiter } = require('../middlewares/rateLimit');

router.get('/register', requireGuest, authController.showRegister);
router.post('/register', requireGuest, registerRules, authController.register);
router.get('/login', requireGuest, authController.showLogin);
router.post('/login', requireGuest, loginLimiter, loginRules, authController.login);
router.post('/logout', requireLogin, authController.logout);

module.exports = router;