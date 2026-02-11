// ====== Sweet Garden — Admin / Finanzas Module ======

(function() {
    'use strict';

    // DOM Elements
    const loginView = document.getElementById('adminLogin');
    const dashboardView = document.getElementById('adminDashboard');
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const logoutBtn = document.getElementById('finanzasLogout');
    const navLogoutItem = document.getElementById('navLogoutItem');
    const userEmailSpan = document.getElementById('finanzasUserEmail');
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
        const now = new Date();
        monthSelect.value = now.getMonth() + 1;
        yearSelect.value = now.getFullYear();

        try {
            const response = await fetch('/api/auth/config');
            const config = await response.json();
            googleClientId = config.clientId;
            tryInitGoogle();
        } catch (err) {
            console.error('Failed to get auth config:', err);
        }

        googleLoginBtn.addEventListener('click', handleGoogleLogin);
        logoutBtn.addEventListener('click', handleLogout);
        loadBtn.addEventListener('click', loadFinanzas);

        // Check for existing session
        const savedSession = localStorage.getItem('finanzas_session');
        if (savedSession) {
            verifySession(savedSession);
        }
    }

    function tryInitGoogle() {
        if (!googleClientId) return;
        const checkInterval = setInterval(() => {
            if (window.google && window.google.accounts) {
                clearInterval(checkInterval);
                initGoogleSignIn();
            }
        }, 100);
        setTimeout(() => clearInterval(checkInterval), 10000);
    }

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

    function handleGoogleLogin() {
        if (!googleClientId) {
            alert('Error de configuración. Por favor recarga la página.');
            return;
        }
        if (currentUser) return;

        if (window.google && window.google.accounts && googleInitialized) {
            google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    openOAuthPopup();
                }
            });
        } else {
            openOAuthPopup();
        }
    }

    // Authorization Code flow — tokens exchanged server-side
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

        const messageHandler = (event) => {
            if (event.origin !== window.location.origin) return;
            if (event.data && event.data.type === 'google-auth') {
                window.removeEventListener('message', messageHandler);

                if (event.data.session_token) {
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

        const checkClosed = setInterval(() => {
            if (popup.closed) {
                clearInterval(checkClosed);
                window.removeEventListener('message', messageHandler);
            }
        }, 500);
    }

    // One Tap callback
    async function handleCredentialResponse(response) {
        await exchangeGoogleToken(response.credential);
    }

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
                googleLoginBtn.textContent = 'Iniciar sesión con Google';
                googleLoginBtn.disabled = false;
                showUnauthorizedMessage(data.email || 'desconocido');
            }
        } catch (err) {
            console.error('Token verification error:', err);
            googleLoginBtn.textContent = 'Iniciar sesión con Google';
            googleLoginBtn.disabled = false;
        }
    }

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
                googleLoginBtn.textContent = 'Iniciar sesión con Google';
                googleLoginBtn.disabled = false;
            }
        } catch (err) {
            localStorage.removeItem('finanzas_session');
            googleLoginBtn.textContent = 'Iniciar sesión con Google';
            googleLoginBtn.disabled = false;
        }
    }

    function showDashboard() {
        loginView.style.display = 'none';
        dashboardView.style.display = '';
        navLogoutItem.style.display = '';
        userEmailSpan.textContent = currentUser.email;
    }

    function handleLogout() {
        currentUser = null;
        localStorage.removeItem('finanzas_session');

        if (window.google && window.google.accounts) {
            google.accounts.id.disableAutoSelect();
        }

        dashboardView.style.display = 'none';
        loginView.style.display = '';
        navLogoutItem.style.display = 'none';
        googleLoginBtn.textContent = 'Iniciar sesión con Google';
        googleLoginBtn.disabled = false;
        resumenEl.classList.add('finanzas--hidden');
        tablasEl.classList.add('finanzas--hidden');
    }

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
                headers: { 'Authorization': `Bearer ${currentUser.token}` }
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

    function renderData(data) {
        const { ingresos, egresos, resumen } = data;

        totalIngresosEl.textContent = formatCurrency(resumen.totalIngresos);
        totalEgresosEl.textContent = formatCurrency(resumen.totalEgresos);
        flujoCajaEl.textContent = formatCurrency(resumen.flujoCaja);

        const flujoCard = flujoCajaEl.closest('.finanzas__card');
        flujoCard.classList.toggle('negative', resumen.flujoCaja < 0);

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

        resumenEl.classList.remove('finanzas--hidden');
        tablasEl.classList.remove('finanzas--hidden');
    }

    // Helpers
    function showLoading(show) {
        loadingEl.classList.toggle('finanzas--hidden', !show);
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

    document.addEventListener('DOMContentLoaded', init);
})();
