require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:"],
            scriptSrc: ["'self'"],
            frameSrc: ["'self'", "https://www.google.com"],
            connectSrc: ["'self'"]
        }
    }
}));

// CORS
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.RENDER_EXTERNAL_URL || true
        : 'http://localhost:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// Parse JSON bodies
app.use(express.json());

// API routes
app.use('/api', apiRoutes);

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    const message = process.env.NODE_ENV === 'production'
        ? 'Ocurrió un error. Por favor intenta nuevamente.'
        : err.message;
    res.status(err.status || 500).json({ error: message });
});

app.listen(PORT, () => {
    console.log(`Sweet Garden server running on port ${PORT}`);
});
