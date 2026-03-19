// ====== Sweet Garden — Admin / Finanzas Module (Spreadsheet View) ======

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
    const totalIngresosEl = document.getElementById('totalIngresos');
    const totalEgresosEl = document.getElementById('totalEgresos');
    const flujoCajaEl = document.getElementById('flujoCaja');
    let activeTab = 'agenda';

    // State
    let currentUser = null;
    let googleClientId = null;
    let googleInitialized = false;
    let sheetData = {
        ingresos: { headers: [], rows: [], currencyColumns: [] },
        egresos: { headers: [], rows: [], currencyColumns: [] }
    };

    // ====== Init ======

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

        // Tab navigation
        document.getElementById('adminTabs').addEventListener('click', (e) => {
            const tab = e.target.closest('.admin-tab');
            if (!tab) return;
            switchTab(tab.dataset.tab);
        });

        const savedSession = localStorage.getItem('finanzas_session');
        if (savedSession) {
            verifySession(savedSession);
        }
    }

    // ====== Google Auth (unchanged) ======

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
                currentUser = { email: data.email, name: data.name, token: data.sessionToken };
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
                currentUser = { email: data.email, name: data.name, token: sessionToken };
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
    }

    // ====== Tab Navigation ======

    function switchTab(tabName) {
        activeTab = tabName;
        // Update tab buttons
        document.querySelectorAll('.admin-tab').forEach(btn => {
            btn.classList.toggle('admin-tab--active', btn.dataset.tab === tabName);
        });
        // Update panels
        document.querySelectorAll('.admin-panel').forEach(panel => {
            panel.classList.remove('admin-panel--active');
        });
        const panelId = 'panel' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
        const panel = document.getElementById(panelId);
        if (panel) panel.classList.add('admin-panel--active');
    }

    // ====== Data Loading ======

    async function loadFinanzas() {
        const year = yearSelect.value;
        const month = monthSelect.value;

        if (!currentUser || !currentUser.token) {
            showError('Sesión expirada.');
            handleLogout();
            return;
        }

        showLoading(true);
        hideError();
        resumenEl.classList.add('finanzas--hidden');

        const headers = { 'Authorization': `Bearer ${currentUser.token}` };

        try {
            const [resumenRes, ingresosRes, egresosRes] = await Promise.all([
                fetch(`/api/finanzas?year=${year}&month=${month}`, { headers }),
                fetch(`/api/finanzas/sheet/ingresos?year=${year}&month=${month}`, { headers }),
                fetch(`/api/finanzas/sheet/egresos?year=${year}&month=${month}`, { headers })
            ]);

            // Check auth on any response
            for (const res of [resumenRes, ingresosRes, egresosRes]) {
                if (res.status === 401 || res.status === 403) {
                    handleLogout();
                    alert('Sesión expirada. Por favor inicia sesión nuevamente.');
                    return;
                }
            }

            if (!resumenRes.ok || !ingresosRes.ok || !egresosRes.ok) {
                const errRes = [resumenRes, ingresosRes, egresosRes].find(r => !r.ok);
                const errData = await errRes.json();
                throw new Error(errData.error || 'Error al cargar datos');
            }

            const [resumen, ingresos, egresos] = await Promise.all([
                resumenRes.json(),
                ingresosRes.json(),
                egresosRes.json()
            ]);

            sheetData.ingresos = ingresos;
            sheetData.egresos = egresos;

            renderSummary(resumen.resumen);
            renderSpreadsheet('ingresos', ingresos);
            renderSpreadsheet('egresos', egresos);

            resumenEl.classList.remove('finanzas--hidden');
        } catch (err) {
            console.error('Finance load error:', err);
            showError(err.message || 'Error al cargar datos financieros');
        } finally {
            showLoading(false);
        }
    }

    // ====== Rendering ======

    function renderSummary(resumen) {
        totalIngresosEl.textContent = formatCurrency(resumen.totalIngresos);
        totalEgresosEl.textContent = formatCurrency(resumen.totalEgresos);
        flujoCajaEl.textContent = formatCurrency(resumen.flujoCaja);

        const flujoCard = flujoCajaEl.closest('.finanzas__card');
        flujoCard.classList.toggle('negative', resumen.flujoCaja < 0);
    }

    function renderSpreadsheet(sheetType, data) {
        const { headers, rows, currencyColumns } = data;
        const tableId = sheetType === 'ingresos' ? 'tablaIngresos' : 'tablaEgresos';
        const tableEl = document.getElementById(tableId);
        const thead = tableEl.querySelector('thead tr');
        const tbody = tableEl.querySelector('tbody');

        // Build header row: # + all sheet headers
        thead.innerHTML = '<th>#</th>' +
            headers.map(h => {
                const div = document.createElement('div');
                div.textContent = h;
                return `<th>${div.innerHTML}</th>`;
            }).join('');

        // Build data rows
        tbody.innerHTML = '';
        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${headers.length + 1}" style="text-align:center;color:var(--gray-600);padding:20px;">Sin datos en este mes</td></tr>`;
            return;
        }

        rows.forEach((rowData, displayIndex) => {
            const tr = document.createElement('tr');

            // Row number (non-editable)
            const numTd = document.createElement('td');
            numTd.textContent = displayIndex + 1;
            numTd.title = `Fila ${rowData.rowIndex} en la hoja`;
            tr.appendChild(numTd);

            // Data cells (read-only)
            rowData.cells.forEach((cellValue, colIndex) => {
                const td = document.createElement('td');
                const isCurrency = currencyColumns.includes(colIndex);

                if (isCurrency && cellValue) {
                    const numVal = parseCurrencyClient(cellValue);
                    td.textContent = numVal !== 0 ? formatCurrency(numVal) : cellValue;
                } else {
                    td.textContent = cellValue;
                }

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
    }


    // ====== Helpers ======

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

    function parseCurrencyClient(value) {
        if (!value) return 0;
        const cleaned = String(value).replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
        return parseFloat(cleaned) || 0;
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

    // ====== Agenda Module ======

    const PLAN_LABELS = { flash: 'Flash — 2 horas', plus: 'Plus — Jornada completa' };
    const PLAN_PRICES = { flash: '$120.000', plus: '$320.000' };
    const PLAN_ROOMS = { flash: 'Salas 4A y 4B', plus: 'Salas 1, 2 y 3' };

    const agenda = {
        plan: null,
        date: null,
        slot: null
    };

    function initAgenda() {
        // Plan buttons
        document.querySelectorAll('.agenda-plan-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                agenda.plan = btn.dataset.plan;
                document.getElementById('agendaPlanLabel').textContent =
                    `${PLAN_LABELS[agenda.plan]} — ${PLAN_ROOMS[agenda.plan]}`;
                agendaGoToStep(2);
                setAgendaMinDate();
            });
        });

        // Date input
        const dateInput = document.getElementById('agendaDate');
        if (dateInput) {
            dateInput.addEventListener('change', () => {
                if (dateInput.value) {
                    agenda.date = dateInput.value;
                    agendaGoToStep(3);
                    loadAgendaSlots();
                }
            });
        }

        // Back buttons
        document.getElementById('agendaBack1').addEventListener('click', () => agendaGoToStep(1));
        document.getElementById('agendaBack2').addEventListener('click', () => agendaGoToStep(2));
        document.getElementById('agendaBack3').addEventListener('click', () => agendaGoToStep(3));

        // Form
        const form = document.getElementById('agendaForm');
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); submitAgenda(); });

        // Reset
        const resetBtn = document.getElementById('agendaReset');
        if (resetBtn) resetBtn.addEventListener('click', resetAgenda);
    }

    function setAgendaMinDate() {
        const dateInput = document.getElementById('agendaDate');
        if (dateInput) {
            const now = new Date();
            dateInput.min = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            dateInput.value = '';
        }
    }

    function agendaGoToStep(step) {
        document.querySelectorAll('.agenda-step').forEach(el => el.classList.add('agenda-step--hidden'));
        const target = document.getElementById(`agendaStep${step}`);
        if (target) target.classList.remove('agenda-step--hidden');

        if (step === 3) {
            const d = new Date(agenda.date + 'T12:00:00');
            document.getElementById('agendaDateDisplay').textContent =
                d.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }
        if (step === 4) updateAgendaSummary();
    }

    function updateAgendaSummary() {
        const el = document.getElementById('agendaSummary');
        if (!el) return;
        const d = new Date(agenda.date + 'T12:00:00');
        const dateStr = d.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        el.innerHTML = `
            <div class="booking-summary__item"><strong>Plan:</strong> ${PLAN_LABELS[agenda.plan]} (${PLAN_PRICES[agenda.plan]})</div>
            <div class="booking-summary__item"><strong>Fecha:</strong> ${dateStr}</div>
            <div class="booking-summary__item"><strong>Horario:</strong> ${agenda.slot.start} — ${agenda.slot.end}</div>
            ${agenda.slot.room ? `<div class="booking-summary__item"><strong>Sala:</strong> ${agenda.slot.room}</div>` : ''}
        `;
    }

    async function loadAgendaSlots() {
        const container = document.getElementById('agendaSlotsContainer');
        const loading = document.getElementById('agendaSlotsLoading');
        const errorEl = document.getElementById('agendaSlotsError');

        container.innerHTML = '';
        loading.classList.remove('agenda-step--hidden');
        errorEl.classList.add('agenda-step--hidden');

        try {
            const res = await fetch(`/api/availability?date=${agenda.date}&plan=${agenda.plan}`);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Error al consultar disponibilidad');
            }

            const slots = await res.json();
            loading.classList.add('agenda-step--hidden');

            if (slots.length === 0) {
                errorEl.textContent = 'No hay disponibilidad para esta fecha. Intenta otro día.';
                errorEl.classList.remove('agenda-step--hidden');
                return;
            }

            slots.forEach(slot => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'slot-btn';
                btn.innerHTML = `
                    <span class="slot-btn__time">${slot.start}</span>
                    <span class="slot-btn__separator">—</span>
                    <span class="slot-btn__time">${slot.end}</span>
                    ${slot.room ? `<span class="slot-btn__room">${slot.room}</span>` : ''}
                `;
                btn.addEventListener('click', () => {
                    container.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('slot-btn--selected'));
                    btn.classList.add('slot-btn--selected');
                    agenda.slot = slot;
                    setTimeout(() => agendaGoToStep(4), 250);
                });
                container.appendChild(btn);
            });
        } catch (err) {
            loading.classList.add('agenda-step--hidden');
            errorEl.textContent = err.message || 'Error de conexión';
            errorEl.classList.remove('agenda-step--hidden');
        }
    }

    async function submitAgenda() {
        const submitBtn = document.getElementById('agendaSubmit');
        const origText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Reservando...';

        const data = {
            bookingType: document.getElementById('agendaBookingType').value,
            planType: agenda.plan,
            date: agenda.date,
            slot: { start: agenda.slot.start, end: agenda.slot.end },
            name: document.getElementById('agendaName').value.trim(),
            email: document.getElementById('agendaEmail').value.trim(),
            phone: document.getElementById('agendaPhone').value.trim(),
            notes: document.getElementById('agendaNotes').value.trim()
        };

        try {
            const res = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await res.json();
            if (!res.ok) {
                const msg = result.errors ? result.errors.join(', ') : result.error;
                throw new Error(msg || 'Error al crear la reserva');
            }

            // Show confirmation
            const details = document.getElementById('agendaConfirmation');
            const d = new Date(data.date + 'T12:00:00');
            const dateStr = d.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            details.innerHTML = `
                <p><strong>${escapeHtml(data.name)}</strong></p>
                <p>${PLAN_LABELS[data.planType]} — ${dateStr}</p>
                <p>${data.slot.start} — ${data.slot.end}</p>
                ${result.booking && result.booking.room ? `<p>Sala asignada: <strong>${escapeHtml(result.booking.room)}</strong></p>` : ''}
            `;
            agendaGoToStep(5);
        } catch (err) {
            alert(err.message || 'Error al crear la reserva.');
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
        }
    }

    function resetAgenda() {
        agenda.plan = null;
        agenda.date = null;
        agenda.slot = null;
        document.getElementById('agendaForm').reset();
        document.getElementById('agendaDate').value = '';
        document.getElementById('agendaSlotsContainer').innerHTML = '';
        agendaGoToStep(1);
    }

    // ====== Mobile Nav Toggle ======
    function initMobileNav() {
        const toggle = document.getElementById('adminNavToggle');
        const menu = document.getElementById('adminNavMenu');
        if (toggle && menu) {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('active');
                menu.classList.toggle('active');
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => { initMobileNav(); init(); initAgenda(); });
})();
