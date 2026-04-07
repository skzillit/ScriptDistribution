/**
 * Role-based access middleware.
 * Roles: admin (full access), editor (full access), viewer (read-only sides)
 *
 * Usage: router.post('/scripts', moduleAuth, requireRole('editor'), ctrl.create)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const userRole = req.user.role || 'viewer';
    if (allowedRoles.includes(userRole)) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

module.exports = { requireRole };
