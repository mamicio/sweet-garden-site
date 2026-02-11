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

        // Check if user has an existing session
        const savedSession = localStorage.getItem('finanzas_session');
        if (savedSession) {
            verifySession(savedSession);
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
                    // Fall back to OAuth popup
                    openOAuthPopup();
                }
            });
        } else {
            // Fall back to OAuth popup
            openOAuthPopup();
        }
    }

    // Open OAuth popup — uses Authorization Code flow (tokens exchanged server-side)
    function openOAuthPopup() {
        const redirectUri = window.location.origin + '/auth/callback';
        const scope = 'openid email profile';
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${encodeURIComponent(googleClientId)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(scope)}` +
            `&access_type=online`;

        const popup = window.open(authUrl, 'GoogleAuth', 'width=500,height=600,menubar=no,toolbar=no');

        if (!popup) {
            alert('Por favor permite las ventanas emergentes para iniciar sesión con Google.');
            return;
        }

        // Listen for message from popup (server already exchanged the code)
        const messageHandler = (event) => {
            if (event.origin !== window.location.origin) return;

            if (event.data && event.data.type === 'google-auth') {
                window.removeEventListener('message', messageHandler);

                if (event.data.session_token) {
                    // Server-side exchange succeeded — store our JWT session
                    currentUser = {
                        email: event.data.email,
                        name: event.data.name,
                        token: event.data.session_token
                    };
                    localStorage.setItem('finanzas_session', event.data.session_token);
                    showDashboard();
                } else if (event.data.error === 'unauthorized') {
                    showUnauthorizedMessage(event.data.email || 'desconocido');
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

    // Handle Google credential response (from One Tap — token comes via JS, not URL)
    async function handleCredentialResponse(response) {
        const googleToken = response.credential;
        await exchangeGoogleToken(googleToken);
    }

    // Send Google id_token to backend, receive our JWT session
    async function exchangeGoogleToken(googleToken) {
        try {
            googleLoginBtn.textContent = 'Verificando...';
            googleLoginBtn.disabled = true;

            const response = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: googleToken })
            });

            const data = await response.json();

            if (data.authorized && data.sessionToken) {
                currentUser = {
                    email: data.email,
                    name: data.name,
                    token: data.sessionToken
                };
                localStorage.setItem('finanzas_session', data.sessionToken);
                showDashboard();
            } else {
                localStorage.removeItem('finanzas_session');
                googleLoginBtn.textContent = 'Admin';
                googleLoginBtn.disabled = false;
                showUnauthorizedMessage(data.email || 'desconocido');
            }
        } catch (err) {
            console.error('Token verification error:', err);
            localStorage.removeItem('finanzas_session');
            googleLoginBtn.textContent = 'Admin';
            googleLoginBtn.disabled = false;
        }
    }

    // Verify existing JWT session on page reload
    async function verifySession(sessionToken) {
        try {
            googleLoginBtn.textContent = 'Verificando...';
            googleLoginBtn.disabled = true;

            const response = await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: sessionToken })
            });

            const data = await response.json();

            if (data.authorized) {
                currentUser = {
                    email: data.email,
                    name: data.name,
                    token: sessionToken
                };
                showDashboard();
            } else {
                localStorage.removeItem('finanzas_session');
                googleLoginBtn.textContent = 'Admin';
                googleLoginBtn.disabled = false;
            }
        } catch (err) {
            localStorage.removeItem('finanzas_session');
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
        localStorage.removeItem('finanzas_session');

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

    function showUnauthorizedMessage(email) {
        // Remove existing modal if any
        const existing = document.getElementById('unauthorizedModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'unauthorizedModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;';
        modal.innerHTML = `
            <div style="background:#fff;border-radius:12px;padding:2rem;max-width:400px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div style="width:56px;height:56px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </div>
                <h3 style="margin:0 0 0.5rem;color:#1a1a2e;font-size:1.25rem;">Acceso denegado</h3>
                <p style="margin:0 0 0.75rem;color:#555;font-size:0.95rem;">El correo <strong>${escapeHtml(email)}</strong> no tiene permisos para acceder al módulo administrativo.</p>
                <p style="margin:0 0 1.5rem;color:#888;font-size:0.85rem;">Si crees que deberías tener acceso, contacta al administrador.</p>
                <button style="background:#667eea;color:#fff;border:none;padding:0.6rem 2rem;border-radius:8px;cursor:pointer;font-size:0.95rem;" onclick="this.closest('#unauthorizedModal').remove()">Entendido</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', init);
})();
