const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const { bookingLimiter } = require('../middleware/rateLimit');
const { getAvailableSlots, createBooking } = require('../services/calendarService');
const { isAuthorizedEmail, getFinanzasResumen } = require('../services/sheetsService');

// Google OAuth client for token verification
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const oauthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Verify Google token and extract user info
async function verifyGoogleToken(token) {
    if (!oauthClient) {
        throw new Error('Google OAuth not configured');
    }

    const ticket = await oauthClient.verifyIdToken({
        idToken: token,
        audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    return {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        emailVerified: payload.email_verified
    };
}

// Middleware to verify authorization token
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autorización requerido' });
    }

    const token = authHeader.substring(7);

    try {
        const user = await verifyGoogleToken(token);

        if (!user.emailVerified) {
            return res.status(403).json({ error: 'Email no verificado' });
        }

        if (!isAuthorizedEmail(user.email)) {
            return res.status(403).json({ error: 'No autorizado' });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('Token verification failed:', err.message);
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

// Health check
router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'sweet-garden' });
});

// Get Google Client ID for frontend
router.get('/auth/config', (req, res) => {
    res.json({
        clientId: GOOGLE_CLIENT_ID || null
    });
});

// Verify Google token and check authorization
router.post('/auth/verify', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Token requerido' });
    }

    try {
        const user = await verifyGoogleToken(token);

        if (!user.emailVerified) {
            return res.json({
                authorized: false,
                email: user.email,
                reason: 'Email no verificado'
            });
        }

        const authorized = isAuthorizedEmail(user.email);

        res.json({
            authorized,
            email: user.email,
            name: user.name
        });
    } catch (err) {
        console.error('Token verification failed:', err.message);
        res.status(401).json({ error: 'Token inválido' });
    }
});

// Get available slots for a date
router.get('/availability', async (req, res, next) => {
    try {
        const { date, plan } = req.query;

        if (!date || !plan) {
            return res.status(400).json({ error: 'Parámetros date y plan son requeridos' });
        }

        if (!['flash', 'plus'].includes(plan)) {
            return res.status(400).json({ error: 'Plan debe ser "flash" o "plus"' });
        }

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'Formato de fecha inválido. Usa YYYY-MM-DD' });
        }

        // Don't allow past dates
        const requestedDate = new Date(date + 'T00:00:00-05:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (requestedDate < today) {
            return res.status(400).json({ error: 'No se puede consultar fechas pasadas' });
        }

        const slots = await getAvailableSlots(date, plan);
        res.json(slots);
    } catch (err) {
        next(err);
    }
});

// Create a booking
router.post('/bookings', bookingLimiter, async (req, res, next) => {
    try {
        const { name, email, phone, date, slot, planType, bookingType, notes } = req.body;

        // Validation
        const errors = [];

        if (!name || name.trim().length < 2) {
            errors.push('Nombre debe tener al menos 2 caracteres');
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.push('Email inválido');
        }
        if (!phone || phone.replace(/\s/g, '').length < 7) {
            errors.push('Teléfono inválido');
        }
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            errors.push('Fecha inválida');
        }
        if (!slot || !slot.start || !slot.end) {
            errors.push('Horario no seleccionado');
        }
        if (!['flash', 'plus'].includes(planType)) {
            errors.push('Tipo de plan inválido');
        }
        if (!['artist', 'client'].includes(bookingType)) {
            errors.push('Tipo de reserva inválido');
        }

        if (errors.length > 0) {
            return res.status(400).json({ errors });
        }

        // Verify slot is still available
        const available = await getAvailableSlots(date, planType);
        const isStillFree = available.some(s => s.start === slot.start && s.end === slot.end);
        if (!isStillFree) {
            return res.status(409).json({ error: 'Este horario ya no está disponible. Por favor selecciona otro.' });
        }

        const booking = await createBooking({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            date,
            slot,
            planType,
            bookingType,
            notes: notes ? notes.trim() : ''
        });

        res.status(201).json({
            message: 'Reserva creada exitosamente',
            booking
        });
    } catch (err) {
        next(err);
    }
});

// Get finance data (requires Google authentication)
router.get('/finanzas', requireAuth, async (req, res, next) => {
    try {
        const { year, month } = req.query;

        const yearNum = parseInt(year);
        const monthNum = parseInt(month);

        if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
            return res.status(400).json({ error: 'Año y mes son requeridos' });
        }

        const data = await getFinanzasResumen(yearNum, monthNum);
        res.json(data);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
