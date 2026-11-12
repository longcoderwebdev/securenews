const router = require('express').Router();
const { requireRole } = require('../middlewares/auth');
const commentController = require('../controllers/commentController');

router.post('/:id/hide', requireRole('editor', 'admin'), commentController.hide);

module.exports = router;