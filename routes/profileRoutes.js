const router = require('express').Router();
const { requireLogin } = require('../middlewares/auth');
const { passwordLimiter } = require('../middlewares/rateLimit');
const profileController = require('../controllers/profileController');

router.use(requireLogin);

router.get('/', profileController.show);
router.post('/', profileController.updateName);
router.post('/password', passwordLimiter, profileController.changePassword);

module.exports = router;