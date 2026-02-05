const { getCalendarClient, getCalendarId } = require('../config/calendar');

const TIMEZONE = 'America/Bogota';

// Business hours: 9 AM to 7 PM
const OPEN_HOUR = 9;
const CLOSE_HOUR = 19;

// Flash slots (2-hour blocks)
const FLASH_SLOTS = [
    { start: '09:00', end: '11:00' },
    { start: '11:00', end: '13:00' },
    { start: '13:00', end: '15:00' },
    { start: '15:00', end: '17:00' },
    { start: '17:00', end: '19:00' }
];

function toISOWithTZ(date, time) {
    return `${date}T${time}:00-05:00`; // Colombia UTC-5
}

function slotsOverlap(slotStart, slotEnd, eventStart, eventEnd) {
    return slotStart < eventEnd && slotEnd > eventStart;
}

async function getAvailableSlots(date, planType) {
    const calendar = getCalendarClient();
    const calendarId = getCalendarId();

    if (!calendar || !calendarId) {
        throw new Error('Google Calendar not configured');
    }

    const timeMin = toISOWithTZ(date, `${String(OPEN_HOUR).padStart(2, '0')}:00`);
    const timeMax = toISOWithTZ(date, `${String(CLOSE_HOUR).padStart(2, '0')}:00`);

    const response = await calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime'
    });

    const events = response.data.items || [];

    // Parse event times to comparable values
    const busyPeriods = events.map(event => ({
        start: new Date(event.start.dateTime || event.start.date),
        end: new Date(event.end.dateTime || event.end.date)
    }));

    if (planType === 'plus') {
        // Plus needs the entire day free
        if (busyPeriods.length === 0) {
            return [{ start: `${String(OPEN_HOUR).padStart(2, '0')}:00`, end: `${String(CLOSE_HOUR).padStart(2, '0')}:00` }];
        }
        return [];
    }

    // Flash: check each 2-hour slot
    return FLASH_SLOTS.filter(slot => {
        const slotStart = new Date(`${date}T${slot.start}:00-05:00`);
        const slotEnd = new Date(`${date}T${slot.end}:00-05:00`);

        return !busyPeriods.some(busy => slotsOverlap(slotStart, slotEnd, busy.start, busy.end));
    });
}

async function createBooking({ name, email, phone, date, slot, planType, bookingType, notes }) {
    const calendar = getCalendarClient();
    const calendarId = getCalendarId();

    if (!calendar || !calendarId) {
        throw new Error('Google Calendar not configured');
    }

    const typeLabel = bookingType === 'artist' ? 'Artista' : 'Cliente';
    const planLabel = planType.toUpperCase();
    // Color IDs: 1=lavender, 5=banana, 9=blueberry, 10=basil, 11=tomato
    const colorId = planType === 'flash' ? '9' : '5';

    const event = {
        summary: `${planLabel} — ${name} (${typeLabel})`,
        description: [
            `Plan: ${planLabel}`,
            `Tipo: ${typeLabel}`,
            `Nombre: ${name}`,
            `Email: ${email}`,
            `Teléfono: ${phone}`,
            notes ? `Notas: ${notes}` : null
        ].filter(Boolean).join('\n'),
        start: {
            dateTime: toISOWithTZ(date, slot.start),
            timeZone: TIMEZONE
        },
        end: {
            dateTime: toISOWithTZ(date, slot.end),
            timeZone: TIMEZONE
        },
        colorId,
        extendedProperties: {
            private: {
                bookingType,
                planType,
                customerName: name,
                customerEmail: email,
                customerPhone: phone
            }
        }
    };

    const response = await calendar.events.insert({
        calendarId,
        resource: event
    });

    return {
        id: response.data.id,
        summary: response.data.summary,
        start: response.data.start,
        end: response.data.end
    };
}

module.exports = { getAvailableSlots, createBooking };
