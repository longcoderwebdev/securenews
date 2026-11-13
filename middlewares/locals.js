module.exports = (req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = (req.originalUrl || '').split('?')[0];
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  req.flash = (type, message) => {
    req.session.flash = { type, message };
  };
  next();
};