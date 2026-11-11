const router = require('express').Router();
const { requireRole } = require('../middlewares/auth');
const categoryController = require('../controllers/categoryController');
const reviewController = require('../controllers/reviewController');

router.use(requireRole('admin'));

router.get('/', (_req, res) => res.render('admin/dashboard', { title: 'Quản trị' }));

router.get('/review', reviewController.list);
router.get('/review/:id', reviewController.show);
router.post('/review/:id/approve', reviewController.approve);
router.post('/review/:id/reject', reviewController.reject);

router.get('/categories', categoryController.list);
router.post('/categories', categoryController.create);
router.get('/categories/:id/edit', categoryController.showEdit);
router.post('/categories/:id', categoryController.update);
router.post('/categories/:id/delete', categoryController.remove);

module.exports = router;