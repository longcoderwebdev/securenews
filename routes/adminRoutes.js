const router = require('express').Router();
const { requireRole } = require('../middlewares/auth');

router.use(requireRole('admin'));
router.get('/', (_req, res) => res.render('admin/dashboard', { title: 'Quản trị' }));

module.exports = router;