const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { isAuthorizedEmail } = require('./sheetsService');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// JWT secret — should be set in env for session persistence across restarts
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET not set — sessions will not survive server restarts');
}

const oauthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Verify a Google id_token (from One Tap or other flows)
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

// Exchange authorization code for tokens (server-side)
async function exchangeCode(code, redirectUri) {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error('Google OAuth not fully configured');
    }

    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
    const { tokens } = await client.getToken(code);
    return tokens;
}

// Create a short-lived JWT session token
function createSessionToken(user) {
    return jwt.sign(
        { email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: '2h' }
    );
}

// Verify our JWT session token
function verifySessionToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

module.exports = {
    verifyGoogleToken,
    exchangeCode,
    createSessionToken,
    verifySessionToken,
    isAuthorizedEmail,
    GOOGLE_CLIENT_ID
};
