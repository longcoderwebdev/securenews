const router = require('express').Router();
const { requireRole } = require('../middlewares/auth');
const { handleCoverUpload } = require('../middlewares/upload');
const editorController = require('../controllers/editorController');

router.use(requireRole('editor'));

router.get('/articles', editorController.list);
router.get('/articles/new', editorController.showNew);
router.post('/articles', handleCoverUpload, editorController.create);
router.get('/articles/:id/edit', editorController.showEdit);
router.post('/articles/:id', handleCoverUpload, editorController.update);
router.post('/articles/:id/submit', editorController.submit);

module.exports = router;