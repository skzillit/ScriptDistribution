const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

const config = require('./config/env');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth.routes');
const scriptsRoutes = require('./routes/scripts.routes');
const versionsRoutes = require('./routes/versions.routes');
const breakdownRoutes = require('./routes/breakdown.routes');
const highlightRoutes = require('./routes/highlight.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const sidesRoutes = require('./routes/sides.routes');
const scheduleRoutes = require('./routes/schedule.routes');
const scriptBreakdownRoutes = require('./routes/scriptBreakdown.routes');

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: false, // allow iframe embedding from web app
}));
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Serve shared highlight assets (check both local dev and deployed paths)
const sharedPath = require('fs').existsSync(path.join(__dirname, '../../shared'))
  ? path.join(__dirname, '../../shared')
  : path.join(__dirname, '../shared');
app.use('/shared', express.static(sharedPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/scripts', scriptsRoutes);
app.use('/api/versions', versionsRoutes);
app.use('/api', breakdownRoutes);
app.use('/api/highlight', highlightRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api', sidesRoutes);
app.use('/api', scheduleRoutes);
app.use('/api', scriptBreakdownRoutes);

// Local file serving (when USE_LOCAL_STORAGE=true)
const { USE_LOCAL, LOCAL_STORAGE_DIR } = require('./services/storage.service');
if (USE_LOCAL) {
  app.get('/api/files/*', (req, res) => {
    const fileKey = decodeURIComponent(req.params[0]);
    const filePath = path.join(LOCAL_STORAGE_DIR, fileKey);
    if (!require('fs').existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.sendFile(filePath);
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Start server — bind port first, then connect DB (so Render health check passes)
const port = config.port || process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  connectDB().catch(err => console.error('MongoDB connection error:', err.message));
});

module.exports = app;
