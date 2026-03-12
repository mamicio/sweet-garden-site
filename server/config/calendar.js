const { google } = require('googleapis');

let calendar = null;

function getCalendarClient() {
    if (calendar) return calendar;

    const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!encoded) {
        console.warn('GOOGLE_SERVICE_ACCOUNT_JSON not set — calendar features disabled');
        return null;
    }

    const credentials = JSON.parse(
        Buffer.from(encoded, 'base64').toString('utf-8')
    );

    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/calendar']
    });

    calendar = google.calendar({ version: 'v3', auth });
    return calendar;
}

// Room configuration
// Plus (full day): Sala 1, Sala 2, Sala 3
// Flash (2h): Sala 4A, Sala 4B
const ROOMS = {
    plus: [
        { name: 'Sala 1', calendarId: process.env.CALENDAR_SALA_1 },
        { name: 'Sala 2', calendarId: process.env.CALENDAR_SALA_2 },
        { name: 'Sala 3', calendarId: process.env.CALENDAR_SALA_3 }
    ],
    flash: [
        { name: 'Sala 4A', calendarId: process.env.CALENDAR_SALA_4A },
        { name: 'Sala 4B', calendarId: process.env.CALENDAR_SALA_4B }
    ]
};

// Business hours
const BUSINESS_START = 9;  // 9 AM
const BUSINESS_END = 20;   // 8 PM

// Legacy single calendar (fallback)
function getCalendarId() {
    return process.env.GOOGLE_CALENDAR_ID || null;
}

function getRooms(planType) {
    return ROOMS[planType] || [];
}

module.exports = {
    getCalendarClient,
    getCalendarId,
    getRooms,
    ROOMS,
    BUSINESS_START,
    BUSINESS_END
};
