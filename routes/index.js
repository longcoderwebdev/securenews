const router = require('express').Router();

router.get('/', (_req, res) => res.render('public/home', { title: 'Trang chủ' }));
router.use('/auth', require('./authRoutes'));

module.exports = router;