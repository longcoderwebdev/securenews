const router = require('express').Router();

router.get('/', (_req, res) => res.render('public/home', { title: 'Trang chủ' }));
router.use('/auth', require('./authRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/editor', require('./editorRoutes'));

module.exports = router;