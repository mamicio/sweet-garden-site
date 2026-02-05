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

function getCalendarId() {
    return process.env.GOOGLE_CALENDAR_ID || null;
}

module.exports = { getCalendarClient, getCalendarId };
