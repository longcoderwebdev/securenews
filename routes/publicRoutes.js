const router = require('express').Router();
const publicController = require('../controllers/publicController');

router.get('/', publicController.list);
router.get('/articles', publicController.list);
router.get('/articles/:slug', publicController.show);

module.exports = router;