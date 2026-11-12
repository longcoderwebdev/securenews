const router = require('express').Router();
const publicController = require('../controllers/publicController');
const commentController = require('../controllers/commentController');
const { requireLogin } = require('../middlewares/auth');
const { commentLimiter } = require('../middlewares/rateLimit');

router.get('/', publicController.list);
router.get('/articles', publicController.list);
router.get('/articles/:slug', publicController.show);
router.post('/articles/:slug/comments', requireLogin, commentLimiter, commentController.add);

module.exports = router;