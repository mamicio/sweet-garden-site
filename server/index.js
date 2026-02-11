require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const {
    exchangeCode,
    verifyGoogleToken,
    createSessionToken,
    isAuthorizedEmail
} = require('./services/authService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://*.googleusercontent.com"],
            scriptSrc: ["'self'", "https://accounts.google.com", "https://apis.google.com"],
            scriptSrcAttr: ["'self'", "'unsafe-inline'"],
            frameSrc: ["'self'", "https://www.google.com", "https://maps.google.com", "https://accounts.google.com"],
            connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com"]
        }
    }
}));

// CORS
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.RENDER_EXTERNAL_URL || true
        : 'http://localhost:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json());

// API routes
app.use('/api', apiRoutes);

// OAuth callback — exchanges authorization code server-side (tokens never reach the browser URL)
app.get('/auth/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        return res.send(renderCallbackPage({ error: decodeURIComponent(error) }));
    }

    if (!code) {
        return res.send(renderCallbackPage({ error: 'No se recibió código de autorización.' }));
    }

    try {
        const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;

        // Exchange code for tokens on the server
        const tokens = await exchangeCode(code, redirectUri);

        // Verify the id_token from Google
        const user = await verifyGoogleToken(tokens.id_token);

        if (!user.emailVerified) {
            return res.send(renderCallbackPage({ error: 'Email no verificado' }));
        }

        const authorized = isAuthorizedEmail(user.email);

        if (!authorized) {
            return res.send(renderCallbackPage({
                error: 'unauthorized',
                email: user.email
            }));
        }

        // Create our own short-lived JWT — this is what the client stores
        const sessionToken = createSessionToken(user);

        return res.send(renderCallbackPage({
            sessionToken,
            email: user.email,
            name: user.name
        }));
    } catch (err) {
        console.error('OAuth code exchange failed:', err.message);
        return res.send(renderCallbackPage({ error: 'Error de autenticación. Intenta de nuevo.' }));
    }
});

function renderCallbackPage({ sessionToken, email, name, error }) {
    const success = !!sessionToken;
    const data = success
        ? { type: 'google-auth', session_token: sessionToken, email, name }
        : { type: 'google-auth', error: error || 'Error desconocido', email: email || null };

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Autenticando...</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;text-align:center;padding:1rem;}.msg{font-size:1.1rem;}</style>
</head><body>
<p class="msg">${success ? 'Autenticación exitosa. Cerrando...' : 'Error de autenticación'}</p>
<script>
(function(){
    if(window.opener){
        window.opener.postMessage(${JSON.stringify(data)},window.location.origin);
    }
    setTimeout(function(){window.close();},${success ? 500 : 3000});
})();
</script>
</body></html>`;
}

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    // API routes return the real error (they're behind auth anyway)
    const isApi = req.path.startsWith('/api/');
    const message = (!isApi && process.env.NODE_ENV === 'production')
        ? 'Ocurrió un error. Por favor intenta nuevamente.'
        : err.message;
    res.status(err.status || 500).json({ error: message });
});

app.listen(PORT, () => {
    console.log(`Sweet Garden server running on port ${PORT}`);
});
