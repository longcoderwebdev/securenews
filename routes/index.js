const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/editor', require('./editorRoutes'));
router.use('/', require('./publicRoutes'));

module.exports = router;