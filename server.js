/* ===================================================
   VENTURE 26 — Shared Timer Server
   
   A minimal Express server that:
   • Serves static files from /public
   • Stores one shared timer end-time in memory
   • GET  /api/timer        → returns the current end time
   • POST /api/timer        → sets a new end time (requires admin code)
   
   Deploy on Render: set Start Command to "node server.js"
   =================================================== */

const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Admin code — change via env var in production if you want
const ADMIN_CODE = process.env.ADMIN_CODE || 'IOTMACEVENTURE';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Shared timer state (in-memory) ----
let timer = {
    endTime: Date.now() + 16 * 60 * 60 * 1000,   // default: 16h from server start
    updatedAt: Date.now()
};

// GET — anyone can read
app.get('/api/timer', (_req, res) => {
    res.json({
        endTime:   timer.endTime,
        updatedAt: timer.updatedAt,
        serverNow: Date.now()      // helps clients detect clock skew
    });
});

// POST — only with correct admin code
app.post('/api/timer', (req, res) => {
    const { code, endTime } = req.body;

    if (!code || code !== ADMIN_CODE) {
        return res.status(403).json({ error: 'Invalid admin code' });
    }

    if (!endTime || typeof endTime !== 'number' || endTime <= Date.now()) {
        return res.status(400).json({ error: 'endTime must be a future timestamp' });
    }

    timer = { endTime, updatedAt: Date.now() };
    console.log(`Timer updated → ends at ${new Date(endTime).toISOString()}`);
    res.json({ success: true, endTime: timer.endTime });
});

// POST — verify admin code
app.post('/api/verify', (req, res) => {
    const { code } = req.body;
    if (!code || code !== ADMIN_CODE) {
        return res.status(403).json({ error: 'Invalid admin code' });
    }
    res.json({ success: true });
});

// SPA fallback — serve index.html for any non-API route
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`⏱  VENTURE 26 Timer running on http://localhost:${PORT}`);
});
