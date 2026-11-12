const asyncHandler = require('../utils/asyncHandler');
const auditQueryService = require('../services/auditQueryService');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta, filters, actions } = await auditQueryService.search(req.query);

  const buildUrl = (page) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    return `/admin/audit-logs${qs ? `?${qs}` : ''}`;
  };

  res.render('admin/audit-logs', { title: 'Nhật ký hoạt động', items, paging: meta, filters, actions, buildUrl });
});