const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/profile', require('./profileRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/editor', require('./editorRoutes'));
router.use('/comments', require('./commentRoutes'));
router.use('/', require('./publicRoutes'));

module.exports = router;