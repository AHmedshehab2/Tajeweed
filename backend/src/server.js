require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const announcementRoutes = require('./routes/announcements');
const progressRoutes = require('./routes/progress');
const uploadRoutes = require('./routes/upload');

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api', contentRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT || 4000);

function startServer(port) {
  const server = app.listen(port, () => console.log(`Tajweed LMS API running on :${port}`));

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is already in use. Trying ${port + 1}...`);
      startServer(port + 1);
      return;
    }

    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

startServer(PORT);
