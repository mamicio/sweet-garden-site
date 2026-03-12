const { getCalendarClient, getRooms, BUSINESS_START, BUSINESS_END } = require('../config/calendar');

const TIMEZONE = 'America/Bogota';

// Flash slots (2-hour blocks) — 9am to 7pm
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

// Get busy periods for a specific calendar on a date
async function getBusyPeriods(calendar, calendarId, date) {
    const timeMin = toISOWithTZ(date, `${String(BUSINESS_START).padStart(2, '0')}:00`);
    const timeMax = toISOWithTZ(date, `${String(BUSINESS_END).padStart(2, '0')}:00`);

    const response = await calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime'
    });

    return (response.data.items || []).map(event => ({
        start: new Date(event.start.dateTime || event.start.date),
        end: new Date(event.end.dateTime || event.end.date)
    }));
}

// Find available slots across multiple rooms
async function getAvailableSlots(date, planType) {
    const calendar = getCalendarClient();
    if (!calendar) throw new Error('Google Calendar not configured');

    const rooms = getRooms(planType);
    const configuredRooms = rooms.filter(r => r.calendarId);

    if (configuredRooms.length === 0) {
        throw new Error(`No hay salas configuradas para el plan ${planType}. Configure las variables CALENDAR_SALA_*.`);
    }

    // Get busy periods for all rooms in parallel
    const allBusyPeriods = await Promise.all(
        configuredRooms.map(room =>
            getBusyPeriods(calendar, room.calendarId, date)
                .then(periods => ({ room, periods }))
                .catch(err => {
                    console.error(`Error checking ${room.name}:`, err.message);
                    return { room, periods: null }; // null = room unavailable
                })
        )
    );

    if (planType === 'plus') {
        // Plus needs entire day free (9am-8pm) in at least one room
        const openTime = `${String(BUSINESS_START).padStart(2, '0')}:00`;
        const closeTime = `${String(BUSINESS_END).padStart(2, '0')}:00`;

        const availableRoom = allBusyPeriods.find(({ periods }) =>
            periods !== null && periods.length === 0
        );

        if (availableRoom) {
            return [{ start: openTime, end: closeTime, room: availableRoom.room.name }];
        }
        return [];
    }

    // Flash: check each 2-hour slot, available if at least one room is free
    return FLASH_SLOTS.filter(slot => {
        const slotStart = new Date(`${date}T${slot.start}:00-05:00`);
        const slotEnd = new Date(`${date}T${slot.end}:00-05:00`);

        return allBusyPeriods.some(({ periods }) => {
            if (periods === null) return false; // room check failed
            return !periods.some(busy => slotsOverlap(slotStart, slotEnd, busy.start, busy.end));
        });
    });
}

// Find the first available room for a specific slot
async function findAvailableRoom(calendar, rooms, date, slotStart, slotEnd) {
    for (const room of rooms) {
        if (!room.calendarId) continue;
        try {
            const periods = await getBusyPeriods(calendar, room.calendarId, date);
            const start = new Date(`${date}T${slotStart}:00-05:00`);
            const end = new Date(`${date}T${slotEnd}:00-05:00`);
            const isFree = !periods.some(busy => slotsOverlap(start, end, busy.start, busy.end));
            if (isFree) return room;
        } catch (err) {
            console.error(`Error checking ${room.name}:`, err.message);
        }
    }
    return null;
}

async function createBooking({ name, email, phone, date, slot, planType, bookingType, notes }) {
    const calendar = getCalendarClient();
    if (!calendar) throw new Error('Google Calendar not configured');

    const rooms = getRooms(planType).filter(r => r.calendarId);
    if (rooms.length === 0) {
        throw new Error(`No hay salas configuradas para el plan ${planType}`);
    }

    // Find first available room
    const room = await findAvailableRoom(calendar, rooms, date, slot.start, slot.end);
    if (!room) {
        throw new Error('No hay salas disponibles para este horario. Por favor selecciona otro.');
    }

    const typeLabel = bookingType === 'artist' ? 'Artista' : 'Cliente';
    const planLabel = planType.toUpperCase();
    const colorId = planType === 'flash' ? '9' : '5';

    const event = {
        summary: `${planLabel} — ${name} (${typeLabel}) — ${room.name}`,
        description: [
            `Plan: ${planLabel}`,
            `Sala: ${room.name}`,
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
                roomName: room.name,
                customerName: name,
                customerEmail: email,
                customerPhone: phone
            }
        }
    };

    const response = await calendar.events.insert({
        calendarId: room.calendarId,
        resource: event
    });

    return {
        id: response.data.id,
        summary: response.data.summary,
        room: room.name,
        start: response.data.start,
        end: response.data.end
    };
}

module.exports = { getAvailableSlots, createBooking };
