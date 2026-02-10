// ====== Sweet Garden — Finanzas Module with Google Sign-In ======

(function() {
    'use strict';

    // DOM Elements
    const finanzasSection = document.getElementById('finanzas');
    const navFinanzas = document.getElementById('navFinanzas');
    const navLogin = document.getElementById('navLogin');
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const dashboard = document.getElementById('finanzasDashboard');
    const userEmailSpan = document.getElementById('finanzasUserEmail');
    const logoutBtn = document.getElementById('finanzasLogout');
    const monthSelect = document.getElementById('finanzasMonth');
    const yearSelect = document.getElementById('finanzasYear');
    const loadBtn = document.getElementById('finanzasLoad');
    const loadingEl = document.getElementById('finanzasLoading');
    const errorEl = document.getElementById('finanzasError');
    const resumenEl = document.getElementById('finanzasResumen');
    const tablasEl = document.getElementById('finanzasTablas');
    const totalIngresosEl = document.getElementById('totalIngresos');
    const totalEgresosEl = document.getElementById('totalEgresos');
    const flujoCajaEl = document.getElementById('flujoCaja');
    const tablaIngresos = document.getElementById('tablaIngresos').querySelector('tbody');
    const tablaEgresos = document.getElementById('tablaEgresos').querySelector('tbody');

    // State
    let currentUser = null;
    let googleClientId = null;
    let googleInitialized = false;

    // Initialize
    async function init() {
        // Set default month and year
        const now = new Date();
        monthSelect.value = now.getMonth() + 1;
        yearSelect.value = now.getFullYear();

        // Get Google Client ID from server
        try {
            const response = await fetch('/api/auth/config');
            const config = await response.json();
            googleClientId = config.clientId;

            // Try to initialize Google Sign-In
            tryInitGoogle();
        } catch (err) {
            console.error('Failed to get auth config:', err);
        }

        // Event listeners
        googleLoginBtn.addEventListener('click', handleGoogleLogin);
        logoutBtn.addEventListener('click', handleLogout);
        loadBtn.addEventListener('click', loadFinanzas);

        // Check if user was previously logged in
        const savedToken = localStorage.getItem('finanzas_token');
        if (savedToken) {
            verifyToken(savedToken);
        }
    }

    // Try to initialize Google Sign-In library
    function tryInitGoogle() {
        if (!googleClientId) return;

        // Check periodically if Google library is loaded
        const checkInterval = setInterval(() => {
            if (window.google && window.google.accounts) {
                clearInterval(checkInterval);
                initGoogleSignIn();
            }
        }, 100);

        // Stop checking after 10 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
        }, 10000);
    }

    // Initialize Google Sign-In
    function initGoogleSignIn() {
        if (!googleClientId || !window.google || googleInitialized) return;

        try {
            google.accounts.id.initialize({
                client_id: googleClientId,
                callback: handleCredentialResponse,
                auto_select: false
            });
            googleInitialized = true;
            console.log('Google Sign-In initialized');
        } catch (err) {
            console.error('Failed to initialize Google Sign-In:', err);
        }
    }

    // Handle Google login button click
    function handleGoogleLogin() {
        if (!googleClientId) {
            alert('Error de configuración. Por favor recarga la página.');
            return;
        }

        // If already logged in, scroll to finanzas
        if (currentUser) {
            finanzasSection.scrollIntoView({ behavior: 'smooth' });
            return;
        }

        // Try using Google library first
        if (window.google && window.google.accounts && googleInitialized) {
            google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    console.log('Google One Tap not displayed:', notification.getNotDisplayedReason?.() || notification.getSkippedReason?.());
                    // Fall back to OAuth popup
                    openOAuthPopup();
                }
            });
        } else {
            // Fall back to OAuth popup
            openOAuthPopup();
        }
    }

    // Open OAuth popup as fallback
    function openOAuthPopup() {
        const redirectUri = window.location.origin + '/auth/callback';
        const scope = 'openid email profile';
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${encodeURIComponent(googleClientId)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=token id_token` +
            `&scope=${encodeURIComponent(scope)}` +
            `&nonce=${Date.now()}`;

        const popup = window.open(authUrl, 'GoogleAuth', 'width=500,height=600,menubar=no,toolbar=no');

        if (!popup) {
            alert('Por favor permite las ventanas emergentes para iniciar sesión con Google.');
            return;
        }

        // Listen for message from popup
        const messageHandler = async (event) => {
            if (event.origin !== window.location.origin) return;

            if (event.data && event.data.type === 'google-auth') {
                window.removeEventListener('message', messageHandler);
                if (event.data.id_token) {
                    await verifyToken(event.data.id_token);
                } else if (event.data.error) {
                    alert('Error de autenticación: ' + event.data.error);
                }
            }
        };

        window.addEventListener('message', messageHandler);

        // Check if popup was closed without auth
        const checkClosed = setInterval(() => {
            if (popup.closed) {
                clearInterval(checkClosed);
                window.removeEventListener('message', messageHandler);
            }
        }, 500);
    }

    // Handle Google credential response (from One Tap)
    async function handleCredentialResponse(response) {
        const token = response.credential;
        await verifyToken(token);
    }

    // Verify token with backend
    async function verifyToken(token) {
        try {
            googleLoginBtn.textContent = 'Verificando...';
            googleLoginBtn.disabled = true;

            const response = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });

            const data = await response.json();

            if (data.authorized) {
                currentUser = {
                    email: data.email,
                    name: data.name,
                    token: token
                };
                localStorage.setItem('finanzas_token', token);
                showDashboard();
            } else {
                localStorage.removeItem('finanzas_token');
                googleLoginBtn.textContent = 'Admin';
                googleLoginBtn.disabled = false;
                alert('Tu cuenta no está autorizada para acceder a Finanzas.\n\nCorreo: ' + (data.email || 'desconocido'));
            }
        } catch (err) {
            console.error('Token verification error:', err);
            localStorage.removeItem('finanzas_token');
            googleLoginBtn.textContent = 'Admin';
            googleLoginBtn.disabled = false;
        }
    }

    // Show dashboard
    function showDashboard() {
        finanzasSection.classList.remove('finanzas--hidden');
        navFinanzas.classList.remove('navbar__item--hidden');
        navLogin.classList.add('logged-in');
        googleLoginBtn.textContent = currentUser.name ? currentUser.name.split(' ')[0] : 'Admin';
        googleLoginBtn.disabled = false;
        dashboard.classList.remove('finanzas--hidden');
        userEmailSpan.textContent = currentUser.email;

        // Scroll to finanzas section
        setTimeout(() => {
            finanzasSection.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }

    // Handle logout
    function handleLogout() {
        currentUser = null;
        localStorage.removeItem('finanzas_token');

        // Revoke Google token
        if (window.google && window.google.accounts) {
            google.accounts.id.disableAutoSelect();
        }

        finanzasSection.classList.add('finanzas--hidden');
        navFinanzas.classList.add('navbar__item--hidden');
        navLogin.classList.remove('logged-in');
        googleLoginBtn.textContent = 'Admin';
        dashboard.classList.add('finanzas--hidden');
        resumenEl.classList.add('finanzas--hidden');
        tablasEl.classList.add('finanzas--hidden');
    }

    // Load finance data
    async function loadFinanzas() {
        const year = yearSelect.value;
        const month = monthSelect.value;

        if (!currentUser || !currentUser.token) {
            showError('Sesión expirada. Por favor inicia sesión nuevamente.');
            handleLogout();
            return;
        }

        showLoading(true);
        hideError();
        resumenEl.classList.add('finanzas--hidden');
        tablasEl.classList.add('finanzas--hidden');

        try {
            const response = await fetch(`/api/finanzas?year=${year}&month=${month}`, {
                headers: {
                    'Authorization': `Bearer ${currentUser.token}`
                }
            });

            if (response.status === 401 || response.status === 403) {
                handleLogout();
                alert('Sesión expirada. Por favor inicia sesión nuevamente.');
                return;
            }

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al cargar datos');
            }

            const data = await response.json();
            renderData(data);
        } catch (err) {
            console.error('Finance load error:', err);
            showError(err.message || 'Error al cargar datos financieros');
        } finally {
            showLoading(false);
        }
    }

    // Render finance data
    function renderData(data) {
        const { ingresos, egresos, resumen } = data;

        // Update summary cards
        totalIngresosEl.textContent = formatCurrency(resumen.totalIngresos);
        totalEgresosEl.textContent = formatCurrency(resumen.totalEgresos);
        flujoCajaEl.textContent = formatCurrency(resumen.flujoCaja);

        // Add negative class if flujo is negative
        const flujoCard = flujoCajaEl.closest('.finanzas__card');
        if (resumen.flujoCaja < 0) {
            flujoCard.classList.add('negative');
        } else {
            flujoCard.classList.remove('negative');
        }

        // Render ingresos table
        tablaIngresos.innerHTML = '';
        if (ingresos.length === 0) {
            tablaIngresos.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray-600);">Sin ingresos en este mes</td></tr>';
        } else {
            ingresos.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.dia}</td>
                    <td>${escapeHtml(item.nombre)}</td>
                    <td>${escapeHtml(item.producto)}</td>
                    <td>${formatCurrency(item.valorNeto)}</td>
                `;
                tablaIngresos.appendChild(row);
            });
        }

        // Render egresos table
        tablaEgresos.innerHTML = '';
        if (egresos.length === 0) {
            tablaEgresos.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray-600);">Sin egresos en este mes</td></tr>';
        } else {
            egresos.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.dia}</td>
                    <td>${escapeHtml(item.comercio)}</td>
                    <td>${escapeHtml(item.concepto)}</td>
                    <td>${formatCurrency(item.valor)}</td>
                `;
                tablaEgresos.appendChild(row);
            });
        }

        // Show data
        resumenEl.classList.remove('finanzas--hidden');
        tablasEl.classList.remove('finanzas--hidden');
    }

    // Helpers
    function showLoading(show) {
        if (show) {
            loadingEl.classList.remove('finanzas--hidden');
        } else {
            loadingEl.classList.add('finanzas--hidden');
        }
    }

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.remove('finanzas--hidden');
    }

    function hideError() {
        errorEl.classList.add('finanzas--hidden');
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', init);
})();
