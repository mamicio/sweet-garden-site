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
    const tablasEl = document.getElementById('finanzasTablas');
    const totalIngresosEl = document.getElementById('totalIngresos');
    const totalEgresosEl = document.getElementById('totalEgresos');
    const flujoCajaEl = document.getElementById('flujoCaja');

    // State
    let currentUser = null;
    let googleClientId = null;
    let googleInitialized = false;
    let sheetData = {
        ingresos: { headers: [], rows: [], currencyColumns: [] },
        egresos: { headers: [], rows: [], currencyColumns: [] }
    };
    const pendingSaves = new Map();
    const SAVE_DEBOUNCE_MS = 800;

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
        document.getElementById('addRowIngresos').addEventListener('click', () => addNewRow('ingresos'));
        document.getElementById('addRowEgresos').addEventListener('click', () => addNewRow('egresos'));

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
        tablasEl.classList.add('finanzas--hidden');
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
        tablasEl.classList.add('finanzas--hidden');

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
            tablasEl.classList.remove('finanzas--hidden');
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

            // Data cells (editable)
            rowData.cells.forEach((cellValue, colIndex) => {
                const td = document.createElement('td');
                const isCurrency = currencyColumns.includes(colIndex);

                if (isCurrency && cellValue) {
                    const numVal = parseCurrencyClient(cellValue);
                    td.textContent = numVal !== 0 ? formatCurrency(numVal) : cellValue;
                    td.dataset.rawValue = cellValue;
                } else {
                    td.textContent = cellValue;
                }

                td.contentEditable = 'true';
                td.dataset.sheetType = sheetType;
                td.dataset.rowIndex = rowData.rowIndex;
                td.dataset.colIndex = colIndex;
                td.dataset.isCurrency = isCurrency;

                td.addEventListener('focus', handleCellFocus);
                td.addEventListener('blur', handleCellBlur);
                td.addEventListener('keydown', handleCellKeydown);

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
    }

    // ====== Cell Editing ======

    function handleCellFocus(e) {
        const td = e.target;
        // Show raw value for currency cells
        if (td.dataset.isCurrency === 'true' && td.dataset.rawValue !== undefined) {
            td.textContent = td.dataset.rawValue;
        }
        td.dataset.originalValue = td.textContent;

        // Select all text
        const range = document.createRange();
        range.selectNodeContents(td);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function handleCellBlur(e) {
        const td = e.target;
        const newValue = td.textContent.trim();
        const originalValue = td.dataset.originalValue || '';
        const isCurrency = td.dataset.isCurrency === 'true';

        // Re-format currency for display
        if (isCurrency) {
            td.dataset.rawValue = newValue;
            const numVal = parseCurrencyClient(newValue);
            td.textContent = numVal !== 0 ? formatCurrency(numVal) : newValue;
        }

        // Only save if changed
        if (newValue !== originalValue) {
            debounceSave(td, newValue);
        }
    }

    function handleCellKeydown(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const next = e.shiftKey ? getPrevCell(e.target) : getNextCell(e.target);
            if (next) next.focus();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const below = getCellBelow(e.target);
            if (below) below.focus();
            else e.target.blur();
        } else if (e.key === 'Escape') {
            e.target.textContent = e.target.dataset.originalValue || '';
            e.target.blur();
        }
    }

    // ====== Cell Navigation ======

    function getNextCell(td) {
        let next = td.nextElementSibling;
        if (next && !next.hasAttribute('contenteditable')) next = next.nextElementSibling;
        if (next) return next;
        const nextRow = td.parentElement.nextElementSibling;
        return nextRow ? nextRow.querySelector('td[contenteditable]') : null;
    }

    function getPrevCell(td) {
        let prev = td.previousElementSibling;
        if (prev && !prev.hasAttribute('contenteditable')) prev = prev.previousElementSibling;
        if (prev) return prev;
        const prevRow = td.parentElement.previousElementSibling;
        if (prevRow) {
            const cells = prevRow.querySelectorAll('td[contenteditable]');
            return cells.length ? cells[cells.length - 1] : null;
        }
        return null;
    }

    function getCellBelow(td) {
        const colPos = Array.from(td.parentElement.children).indexOf(td);
        const nextRow = td.parentElement.nextElementSibling;
        return (nextRow && nextRow.children[colPos]) ? nextRow.children[colPos] : null;
    }

    // ====== Auto-Save ======

    function debounceSave(td, value) {
        const key = `${td.dataset.sheetType}-${td.dataset.rowIndex}-${td.dataset.colIndex}`;

        if (pendingSaves.has(key)) {
            clearTimeout(pendingSaves.get(key).timeout);
        }

        td.classList.add('finanzas__cell--saving');
        updateSaveStatus(td.dataset.sheetType, 'Guardando...');

        const timeout = setTimeout(() => executeSave(td, key, value), SAVE_DEBOUNCE_MS);
        pendingSaves.set(key, { timeout });
    }

    async function executeSave(td, key, value) {
        try {
            const response = await fetch('/api/finanzas/cell', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentUser.token}`
                },
                body: JSON.stringify({
                    sheetType: td.dataset.sheetType,
                    rowIndex: parseInt(td.dataset.rowIndex),
                    colIndex: parseInt(td.dataset.colIndex),
                    value: value
                })
            });

            if (response.status === 401 || response.status === 403) {
                handleLogout();
                alert('Sesión expirada.');
                return;
            }

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al guardar');
            }

            td.classList.remove('finanzas__cell--saving');
            td.classList.add('finanzas__cell--saved');
            setTimeout(() => td.classList.remove('finanzas__cell--saved'), 600);
            updateSaveStatus(td.dataset.sheetType, 'Guardado');
            setTimeout(() => updateSaveStatus(td.dataset.sheetType, ''), 2000);
        } catch (err) {
            console.error('Save error:', err);
            td.classList.remove('finanzas__cell--saving');
            td.classList.add('finanzas__cell--error');
            updateSaveStatus(td.dataset.sheetType, `Error: ${err.message}`, true);
            setTimeout(() => td.classList.remove('finanzas__cell--error'), 3000);
        } finally {
            pendingSaves.delete(key);
        }
    }

    function updateSaveStatus(sheetType, message, isError) {
        const el = document.getElementById(sheetType === 'ingresos' ? 'ingresosStatus' : 'egresosStatus');
        el.textContent = message;
        el.className = 'finanzas__save-status' +
            (isError ? ' finanzas__save-status--error' : message ? ' finanzas__save-status--saving' : '');
    }

    // ====== Add New Row ======

    async function addNewRow(sheetType) {
        const data = sheetData[sheetType];
        if (!data.headers.length) {
            showError('Carga los datos primero con "Consultar"');
            return;
        }

        const year = yearSelect.value;
        const month = monthSelect.value;

        // Find year/month columns to pre-fill
        const headers = data.headers;
        const yearCol = headers.findIndex(h => h && h.toString().toLowerCase().trim() === 'año');
        const monthCol = headers.findIndex(h => h && h.toString().toLowerCase().trim() === 'mes');

        const cells = Array(headers.length).fill('');
        if (yearCol !== -1) cells[yearCol] = year;
        if (monthCol !== -1) cells[monthCol] = month;

        try {
            updateSaveStatus(sheetType, 'Agregando fila...');

            const response = await fetch('/api/finanzas/row', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentUser.token}`
                },
                body: JSON.stringify({ sheetType, cells })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al agregar fila');
            }

            const result = await response.json();

            // Add to local state and re-render
            data.rows.push({ rowIndex: result.rowIndex, cells });
            renderSpreadsheet(sheetType, data);

            updateSaveStatus(sheetType, 'Fila agregada');
            setTimeout(() => updateSaveStatus(sheetType, ''), 2000);

            // Scroll to bottom and focus first editable cell
            const tableEl = document.getElementById(sheetType === 'ingresos' ? 'tablaIngresos' : 'tablaEgresos');
            const wrapper = tableEl.closest('.finanzas__table-wrapper--spreadsheet');
            wrapper.scrollTop = wrapper.scrollHeight;

            const tbody = tableEl.querySelector('tbody');
            const lastRow = tbody.lastElementChild;
            const firstEditable = lastRow && lastRow.querySelector('td[contenteditable]');
            if (firstEditable) firstEditable.focus();
        } catch (err) {
            console.error('Add row error:', err);
            updateSaveStatus(sheetType, `Error: ${err.message}`, true);
        }
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

    document.addEventListener('DOMContentLoaded', init);
})();
