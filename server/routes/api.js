const express = require('express');
const router = express.Router();
const { bookingLimiter } = require('../middleware/rateLimit');
const { getAvailableSlots, createBooking } = require('../services/calendarService');

// Health check
router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'sweet-garden' });
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

module.exports = router;
