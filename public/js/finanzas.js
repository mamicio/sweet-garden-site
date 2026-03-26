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
    let sheetData = {
        ingresos: { headers: [], rows: [], currencyColumns: [] },
        egresos: { headers: [], rows: [], currencyColumns: [] }
    };

    // ====== Init ======

    async function init() {
        const now = new Date();
        monthSelect.value = now.getMonth() + 1;
        yearSelect.value = now.getFullYear();

        logoutBtn.addEventListener('click', handleLogout);
        loadBtn.addEventListener('click', loadFinanzas);

        // Tab navigation
        document.getElementById('adminTabs').addEventListener('click', (e) => {
            const tab = e.target.closest('.admin-tab');
            if (!tab) return;
            switchTab(tab.dataset.tab);
        });

        // Check for token in URL fragment (from OAuth redirect)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const tokenFromUrl = hashParams.get('token');
        if (tokenFromUrl) {
            history.replaceState(null, '', '/admin');
            localStorage.setItem('finanzas_session', tokenFromUrl);
            verifySession(tokenFromUrl);
            return;
        }

        const savedSession = localStorage.getItem('finanzas_session');
        if (savedSession) {
            verifySession(savedSession);
        }
    }

    // ====== Auth ======

    async function verifySession(sessionToken) {
        try {
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
            }
        } catch (err) {
            localStorage.removeItem('finanzas_session');
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
        dashboardView.style.display = 'none';
        loginView.style.display = '';
        navLogoutItem.style.display = 'none';
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

    // ====== Ventas Module ======

    const VENTAS_KEY = 'sg_ventas';

    function getVentas() {
        try { return JSON.parse(localStorage.getItem(VENTAS_KEY)) || []; }
        catch { return []; }
    }

    function saveVentas(list) {
        localStorage.setItem(VENTAS_KEY, JSON.stringify(list));
    }

    // Columnas que NO se muestran al usuario (calculadas por Sheet o sistema)
    function isHiddenCol(lower) {
        const exact = new Set(['día', 'valor sin iva', 'vlr ant de iva', 'valor neto', 'url', 'tipo de documento', 'pedido']);
        if (exact.has(lower)) return true;
        if (lower.includes('documento') && lower.includes('wo')) return true;
        return false;
    }
    // Columnas que NO se auto-rellenan al buscar por ID
    const NO_AUTOFILL_COLS = new Set(['producto', 'valor bruto', 'valor sin iva', 'vlr ant de iva', 'valor neto', 'url', 'comentarios']);

    let sheetMeta = { headers: [], currencyHeaders: [] };
    let allSheetRows = null; // cache para búsqueda por ID

    function initVentas() {
        const ventasMonthEl = document.getElementById('ventasMonth');
        const ventasYearEl  = document.getElementById('ventasYear');

        const now = new Date();
        if (ventasMonthEl) ventasMonthEl.value = now.getMonth() + 1;
        if (ventasYearEl)  ventasYearEl.value  = now.getFullYear();

        document.getElementById('btnFacturaVenta').addEventListener('click', async () => {
            document.getElementById('modalFacturaVenta').style.display = 'flex';
            await loadVentaForm();
        });

        document.getElementById('btnCerrarModal').addEventListener('click', closeFacturaModal);
        document.getElementById('modalFacturaVenta').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeFacturaModal();
        });

        document.getElementById('formFacturaVenta').addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitFacturaVenta();
        });

        // Open ventas wizard (Step 1)
        document.getElementById('btnVerVentas').addEventListener('click', () => {
            document.getElementById('ingresosTableView').style.display = 'none';
            document.getElementById('ventasView').style.display = '';
            ventasGoToStep(1);
        });

        // Close wizard → back to ingresos table
        document.getElementById('btnCerrarVentas').addEventListener('click', () => {
            document.getElementById('ventasView').style.display = 'none';
            document.getElementById('ingresosTableView').style.display = '';
        });

        // Month buttons (Step 1 → Step 2)
        document.querySelectorAll('.ventas-pick-btn[data-month]').forEach(btn => {
            btn.addEventListener('click', () => {
                ventasSelectedMonth = parseInt(btn.dataset.month);
                const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
                document.getElementById('ventasStep2Title').textContent = `Año — ${MESES[ventasSelectedMonth - 1]}`;
                ventasGoToStep(2);
            });
        });

        // Year buttons (Step 2 → Step 3: load data)
        document.querySelectorAll('.ventas-pick-btn[data-year]').forEach(btn => {
            btn.addEventListener('click', () => {
                ventasSelectedYear = parseInt(btn.dataset.year);
                ventasGoToStep(3);
                loadVentasHistory(ventasSelectedMonth, ventasSelectedYear);
            });
        });

        // Back buttons within wizard
        document.getElementById('ventasBack1').addEventListener('click', () => ventasGoToStep(1));
        document.getElementById('ventasBack2').addEventListener('click', () => ventasGoToStep(1));
    }

    let ventasSelectedMonth = null;
    let ventasSelectedYear  = null;

    function ventasGoToStep(step) {
        [1, 2, 3].forEach(n => {
            const el = document.getElementById(`ventasStep${n}`);
            if (el) el.style.display = n === step ? '' : 'none';
        });
    }

    async function loadVentaForm() {
        const fieldsContainer = document.getElementById('ventaFormFields');
        if (!fieldsContainer) return;
        if (sheetMeta.headers.length > 0) return; // ya cargado

        fieldsContainer.innerHTML = '<p style="color:var(--gray-600);text-align:center;">Cargando columnas...</p>';

        try {
            const [headersRes, allRowsRes] = await Promise.all([
                fetch('/api/finanzas/sheet/ingresos/headers', { headers: { 'Authorization': `Bearer ${currentUser.token}` } }),
                fetch('/api/finanzas/sheet/ingresos/all',     { headers: { 'Authorization': `Bearer ${currentUser.token}` } })
            ]);
            if (!headersRes.ok) throw new Error('No se pudieron cargar las columnas');
            sheetMeta = await headersRes.json();
            const allData = await allRowsRes.json();
            allSheetRows = allData.rows || [];
        } catch (err) {
            fieldsContainer.innerHTML = `<p style="color:#c53030;">Error: ${escapeHtml(err.message)}</p>`;
            return;
        }

        buildVentaFields(fieldsContainer);
    }

    // ====== Venta Mostrador ======

    const MOSTRADOR_PRODUCTS = ['Botella Aqua', 'Monster', 'Cerveza Pilsen'];

    function buildMostradorRow(section, prod) {
        const row = document.createElement('div');
        row.className = 'mostrador-item';
        row.dataset.product = prod;

        const label = document.createElement('label');
        label.className = 'mostrador-label';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'mostrador-check';
        label.appendChild(check);
        label.appendChild(document.createTextNode(' ' + prod));

        const qtyInput = document.createElement('input');
        qtyInput.type = 'number'; qtyInput.min = '0'; qtyInput.step = '1';
        qtyInput.placeholder = 'Cant.'; qtyInput.disabled = true;
        qtyInput.className = 'mostrador-qty';

        const priceInput = document.createElement('input');
        priceInput.type = 'number'; priceInput.min = '0'; priceInput.step = '1';
        priceInput.placeholder = '$ Unit.'; priceInput.disabled = true;
        priceInput.className = 'mostrador-price';

        const subtotal = document.createElement('span');
        subtotal.className = 'mostrador-subtotal';
        subtotal.textContent = '$0';

        // Remove button (only for custom items, not default ones)
        const isDefault = MOSTRADOR_PRODUCTS.includes(prod);
        if (!isDefault) {
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'mostrador-remove';
            removeBtn.title = 'Eliminar';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', () => { row.remove(); updateMostradorTotals(); });
            row.appendChild(removeBtn);
        }

        check.addEventListener('change', () => {
            qtyInput.disabled = !check.checked;
            priceInput.disabled = !check.checked;
            if (!check.checked) { qtyInput.value = ''; priceInput.value = ''; }
            updateMostradorTotals();
        });
        qtyInput.addEventListener('input', updateMostradorTotals);
        priceInput.addEventListener('input', updateMostradorTotals);

        row.appendChild(label);
        row.appendChild(qtyInput);
        row.appendChild(priceInput);
        row.appendChild(subtotal);

        // Insert before the grandTotal line
        const gt = section.querySelector('.mostrador-grand-total');
        section.insertBefore(row, gt);
        return row;
    }

    function buildMostradorSection() {
        const section = document.createElement('div');
        section.id = 'mostradorSection';
        section.className = 'mostrador-section';
        section.style.display = 'none';

        // Header: title + search
        const header = document.createElement('div');
        header.className = 'mostrador-section__header';

        const title = document.createElement('p');
        title.className = 'mostrador-section__title';
        title.textContent = 'Detalle de productos';
        header.appendChild(title);

        // Lupa / filter
        const searchWrap = document.createElement('div');
        searchWrap.className = 'mostrador-search-wrap';
        const searchIcon = document.createElement('span');
        searchIcon.className = 'mostrador-search-icon';
        searchIcon.textContent = '🔍';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'mostrador-search-input';
        searchInput.placeholder = 'Filtrar productos...';
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase().trim();
            section.querySelectorAll('.mostrador-item').forEach(row => {
                row.style.display = (!q || row.dataset.product.toLowerCase().includes(q)) ? '' : 'none';
            });
        });
        searchWrap.appendChild(searchIcon);
        searchWrap.appendChild(searchInput);
        header.appendChild(searchWrap);
        section.appendChild(header);

        // Grand total placeholder (needed before rows so insertBefore works)
        const grandTotal = document.createElement('div');
        grandTotal.id = 'mostradorGrandTotal';
        grandTotal.className = 'mostrador-grand-total';
        grandTotal.textContent = 'Total: $0';
        section.appendChild(grandTotal);

        // Default products
        MOSTRADOR_PRODUCTS.forEach(prod => buildMostradorRow(section, prod));

        // Add-product row
        const addRow = document.createElement('div');
        addRow.className = 'mostrador-add-row';

        const addInput = document.createElement('input');
        addInput.type = 'text';
        addInput.className = 'mostrador-add-input';
        addInput.placeholder = 'Nombre del producto...';

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'mostrador-add-btn';
        addBtn.textContent = '+ Agregar';

        const addFeedback = document.createElement('span');
        addFeedback.className = 'mostrador-add-feedback';

        addBtn.addEventListener('click', () => {
            const name = addInput.value.trim();
            if (!name) return;

            // Check duplicate (case-insensitive)
            const existing = [...section.querySelectorAll('.mostrador-item')]
                .find(r => r.dataset.product.toLowerCase() === name.toLowerCase());

            if (existing) {
                addFeedback.textContent = '⚠ Ya existe';
                addFeedback.style.color = '#e67e22';
                // Highlight existing row briefly
                existing.style.background = '#fff3cd';
                setTimeout(() => { existing.style.background = ''; addFeedback.textContent = ''; }, 2000);
                return;
            }

            buildMostradorRow(section, name);
            addInput.value = '';
            addFeedback.textContent = '✓ Agregado';
            addFeedback.style.color = '#27ae60';
            setTimeout(() => { addFeedback.textContent = ''; }, 1500);
        });

        addInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); } });

        addRow.appendChild(addInput);
        addRow.appendChild(addBtn);
        addRow.appendChild(addFeedback);
        section.appendChild(addRow);

        // Move grand total to after the add row
        section.appendChild(grandTotal);

        return section;
    }

    function updateMostradorTotals() {
        let grand = 0;
        document.querySelectorAll('.mostrador-item').forEach(row => {
            const check = row.querySelector('.mostrador-check');
            const qty   = parseFloat(row.querySelector('.mostrador-qty').value)   || 0;
            const price = parseFloat(row.querySelector('.mostrador-price').value) || 0;
            const total = check.checked ? qty * price : 0;
            row.querySelector('.mostrador-subtotal').textContent = formatCurrency(total);
            grand += total;
        });
        const gtEl = document.getElementById('mostradorGrandTotal');
        if (gtEl) gtEl.textContent = `Total: ${formatCurrency(grand)}`;

        // Auto-fill Valor bruto
        const vbIdx = sheetMeta.headers.findIndex(h => h.toLowerCase().trim() === 'valor bruto');
        if (vbIdx !== -1) {
            const vbEl = document.getElementById(`venta_col_${vbIdx}`);
            if (vbEl) vbEl.value = grand || '';
        }
    }

    function getMostradorJSON() {
        const items = [];
        document.querySelectorAll('.mostrador-item').forEach(row => {
            if (!row.querySelector('.mostrador-check').checked) return;
            const qty   = parseFloat(row.querySelector('.mostrador-qty').value)   || 0;
            const price = parseFloat(row.querySelector('.mostrador-price').value) || 0;
            if (qty > 0) items.push({
                producto: row.dataset.product,
                cantidad: qty,
                valorUnitario: price,
                valorTotal: qty * price
            });
        });
        return JSON.stringify(items);
    }

    // ====== End Venta Mostrador ======

    function getUniqueColValues(colName) {
        if (!allSheetRows || !sheetMeta.headers.length) return [];
        const idx = sheetMeta.headers.findIndex(h => h.toLowerCase().trim() === colName.toLowerCase().trim());
        if (idx === -1) return [];
        const seen = new Set();
        allSheetRows.forEach(row => { const v = (row.cells[idx] || '').trim(); if (v) seen.add(v); });
        return Array.from(seen).sort();
    }

    function makeSelect(id, colIndex, header, options, placeholder) {
        const sel = document.createElement('select');
        sel.id = id; sel.dataset.colIndex = colIndex; sel.dataset.header = header;
        const empty = document.createElement('option');
        empty.value = ''; empty.textContent = placeholder || '— Selecciona —';
        sel.appendChild(empty);
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt; o.textContent = opt;
            sel.appendChild(o);
        });
        return sel;
    }

    function buildVentaFields(container) {
        container.innerHTML = '';
        const headers = sheetMeta.headers;

        // Orden explícito: ID primero, luego Tipo ID, luego el resto
        const idIdx     = headers.findIndex(h => h.toLowerCase().trim() === 'id');
        const tipoIdIdx = headers.findIndex(h => h.toLowerCase().trim() === 'tipo id');
        const ordered   = [];
        if (idIdx !== -1)     ordered.push(idIdx);
        if (tipoIdIdx !== -1) ordered.push(tipoIdIdx);
        headers.forEach((_, i) => { if (!ordered.includes(i)) ordered.push(i); });

        // Opciones para dropdowns
        const tipoIdOpts = [
            'CC',
            'CE',
            'Tarjeta de extranjería',
            'Cédula de extranjería',
            'NIT',
            'Pasaporte',
            'Documento de Identificación Extranjero',
            'Sin ID del exterior o para uso definido por DIAN',
            'Permiso Especial de Permanencia'
        ];
        const productoOpts = getUniqueColValues('producto');

        ordered.forEach(idx => {
            const header = headers[idx];
            const lower  = header.toLowerCase().trim();

            if (lower === 'año' || lower === 'mes') return;
            if (isHiddenCol(lower)) return;

            const isCurrency  = sheetMeta.currencyHeaders.some(ch => ch.toLowerCase().trim() === lower);
            const isIdField   = lower === 'id';
            const isTipoId    = lower === 'tipo id';
            const isProducto  = lower.includes('producto');
            const isMedioPago = lower.includes('medio') && lower.includes('pago');
            const isApellido  = lower === 'apellidos' || lower === 'apellido';

            const div = document.createElement('div');
            div.className = 'booking-field';

            const label = document.createElement('label');
            label.textContent = header;
            div.appendChild(label);

            if (isIdField) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;gap:8px;align-items:center;';
                const input = document.createElement('input');
                input.type = 'text'; input.id = `venta_col_${idx}`;
                input.dataset.colIndex = idx; input.dataset.header = header;
                input.placeholder = 'Número de documento';
                const searchBtn = document.createElement('button');
                searchBtn.type = 'button'; searchBtn.textContent = 'Buscar';
                searchBtn.className = 'btn btn--venta';
                searchBtn.style.cssText = 'padding:8px 14px;font-size:0.8rem;white-space:nowrap;flex-shrink:0;';
                searchBtn.addEventListener('click', () => autoFillById(input.value.trim(), searchBtn));
                input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); autoFillById(input.value.trim(), searchBtn); } });
                input.addEventListener('focus', () => clearVentaFields(input));
                row.appendChild(input); row.appendChild(searchBtn);
                div.appendChild(row);

            } else if (isTipoId) {
                const sel = makeSelect(`venta_col_${idx}`, idx, header, tipoIdOpts, '— Tipo de documento —');
                sel.dataset.isTipoId = 'true';
                sel.addEventListener('change', updateApellidoRequired);
                div.appendChild(sel);

            } else if (isProducto) {
                const sel = makeSelect(`venta_col_${idx}`, idx, header, productoOpts, '— Selecciona producto —');
                sel.addEventListener('change', () => {
                    const sec = document.getElementById('mostradorSection');
                    const isMostrador = sel.value.toLowerCase().includes('mostrador');
                    if (sec) sec.style.display = isMostrador ? '' : 'none';
                    if (!isMostrador) updateMostradorTotals();
                });
                div.appendChild(sel);
                // Append mostrador section right after this field
                const mostradorDiv = buildMostradorSection();
                div.appendChild(mostradorDiv);

            } else if (isMedioPago) {
                const sel = makeSelect(`venta_col_${idx}`, idx, header, ['Efectivo', 'Ahorros'], '— Medio de pago —');
                div.appendChild(sel);

            } else if (isCurrency) {
                const input = document.createElement('input');
                input.type = 'number'; input.id = `venta_col_${idx}`;
                input.dataset.colIndex = idx; input.dataset.header = header;
                input.min = '0'; input.step = '1'; input.placeholder = '0';
                div.appendChild(input);

            } else {
                const input = document.createElement('input');
                input.type = 'text'; input.id = `venta_col_${idx}`;
                input.dataset.colIndex = idx; input.dataset.header = header;
                input.placeholder = header;
                if (isApellido) input.dataset.isApellido = 'true';
                div.appendChild(input);
            }

            container.appendChild(div);
        });

        updateApellidoRequired();
    }

    function clearVentaFields(exceptInput) {
        sheetMeta.headers.forEach((header, idx) => {
            const lower = header.toLowerCase().trim();
            if (lower === 'id') return; // no limpiar el campo ID
            const el = document.getElementById(`venta_col_${idx}`);
            if (el && el !== exceptInput) el.value = '';
        });
    }

    function updateApellidoRequired() {
        const tipoIdEl = document.querySelector('[data-is-tipo-id="true"]');
        const apellidoEl = document.querySelector('[data-is-apellido="true"]');
        if (!tipoIdEl || !apellidoEl) return;
        const isNit = tipoIdEl.value.toUpperCase() === 'NIT';
        apellidoEl.closest('.booking-field').style.opacity = isNit ? '0.5' : '1';
        apellidoEl.dataset.optional = isNit ? 'true' : 'false';
        if (isNit) apellidoEl.value = '';
    }

    function autoFillById(idValue, btn) {
        if (!idValue || !allSheetRows || !sheetMeta.headers.length) return;

        const idColIdx = sheetMeta.headers.findIndex(h => h.toLowerCase().trim() === 'id');
        if (idColIdx === -1) return;

        // Find the most recent row matching this ID (compare as strings)
        const match = [...allSheetRows].reverse().find(
            row => String(row.cells[idColIdx]).trim() === String(idValue).trim()
        );

        if (!match) {
            if (btn) {
                const orig = btn.textContent;
                btn.textContent = 'No encontrado';
                btn.style.background = '#c53030';
                setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 2000);
            }
            return;
        }

        sheetMeta.headers.forEach((header, idx) => {
            const lower = header.toLowerCase().trim();
            if (NO_AUTOFILL_COLS.has(lower) || lower === 'id' || lower === 'año' || lower === 'mes' || lower === 'día') return;
            const el = document.getElementById(`venta_col_${idx}`);
            if (el && match.cells[idx] !== undefined) {
                el.value = match.cells[idx];
            }
        });
        updateApellidoRequired();

        if (btn) {
            const orig = btn.textContent;
            btn.textContent = '✓ Cargado';
            btn.style.background = '#1a7a2e';
            setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 2000);
        }
    }

    async function submitFacturaVenta() {
        if (!sheetMeta.headers.length) return;

        const now = new Date();
        const ventasMonthEl = document.getElementById('ventasMonth');
        const ventasYearEl  = document.getElementById('ventasYear');
        const selectedYear  = parseInt(ventasYearEl?.value || now.getFullYear());
        const selectedMonth = parseInt(ventasMonthEl?.value || now.getMonth() + 1);

        // --- Validación ---
        const tipoIdEl   = document.querySelector('[data-is-tipo-id="true"]');
        const apellidoEl = document.querySelector('[data-is-apellido="true"]');
        const isNit      = tipoIdEl && tipoIdEl.value.toUpperCase() === 'NIT';
        let missingField = null;

        sheetMeta.headers.forEach((header, idx) => {
            if (missingField) return;
            const lower = header.toLowerCase().trim();
            if (lower === 'año' || lower === 'mes' || lower === 'día') return;
            if (isHiddenCol(lower)) return;

            const el = document.getElementById(`venta_col_${idx}`);
            if (!el) return;

            const isApellido = el.dataset.isApellido === 'true';
            if (isApellido && isNit) return; // Apellido no requerido para NIT

            const isOptionalByDefault = lower === 'dirección' || lower === 'direccion' || lower === 'teléfono' || lower === 'telefono' || lower === 'correo' || lower === 'comentarios';
            if (isOptionalByDefault) return; // estos tienen default o son opcionales

            const val = (el.value || '').trim();
            if (!val) missingField = header;
        });

        if (missingField) {
            alert(`El campo "${missingField}" es obligatorio.`);
            return;
        }

        const submitBtn = document.querySelector('#formFacturaVenta button[type="submit"]');
        const origText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Guardando...';

        // Build Pedido JSON if Venta mostrador
        const productoIdx = sheetMeta.headers.findIndex(h => h.toLowerCase().trim().includes('producto'));
        const productoEl  = productoIdx !== -1 ? document.getElementById(`venta_col_${productoIdx}`) : null;
        const isVentaMostrador = productoEl && productoEl.value.toLowerCase().includes('mostrador');
        const pedidoJson = isVentaMostrador ? getMostradorJSON() : '';

        // --- Construir array de valores ---
        const values = sheetMeta.headers.map((header, idx) => {
            const lower = header.toLowerCase().trim();
            if (lower === 'año') return selectedYear;
            if (lower === 'mes') return selectedMonth;
            if (lower === 'día') return now.getDate();
            if (isHiddenCol(lower)) return '';
            if (lower === 'pedido') return pedidoJson;

            const el = document.getElementById(`venta_col_${idx}`);
            let val = el ? (el.value || '').trim() : '';

            // Valores por defecto
            if (!val && (lower === 'dirección' || lower === 'direccion')) val = 'SIN INFORMAR';
            if (!val && (lower === 'teléfono'  || lower === 'telefono'))  val = '1111111111';
            if (!val && lower === 'correo')                                val = 'sweetgardentattoo@gmail.com';

            return val;
        });

        // --- Validar campos requeridos para WO antes de llamar al servidor ---
        const idColIdx2  = sheetMeta.headers.findIndex(h => h.toLowerCase().trim() === 'id');
        const mpColIdx   = sheetMeta.headers.findIndex(h => h.toLowerCase().includes('medio') && h.toLowerCase().includes('pago'));
        const clienteId  = idColIdx2 !== -1 ? (values[idColIdx2] || '').toString().trim() : '';
        const medioPagoV = mpColIdx  !== -1 ? (values[mpColIdx]  || '').toString().trim() : '';

        if (!clienteId) {
            alert('El campo ID del cliente es obligatorio para crear la factura en WorldOffice.');
            submitBtn.disabled = false; submitBtn.textContent = origText; return;
        }
        if (!medioPagoV) {
            alert('Selecciona el Medio de pago antes de guardar.');
            submitBtn.disabled = false; submitBtn.textContent = origText; return;
        }

        // Verificar que haya al menos un renglón con valor
        const tieneRenglones = isVentaMostradorActiva()
            ? [...document.querySelectorAll('.mostrador-item')].some(row =>
                row.querySelector('.mostrador-check').checked &&
                parseFloat(row.querySelector('.mostrador-qty').value) > 0)
            : (parseFloat(values[sheetMeta.headers.findIndex(h => h.toLowerCase().trim() === 'valor bruto')] || 0) > 0);

        if (!tieneRenglones) {
            alert('Ingresa el Valor bruto o selecciona al menos un producto del mostrador con cantidad.');
            submitBtn.disabled = false; submitBtn.textContent = origText; return;
        }

        try {
            // 1. Crear documento en WorldOffice
            submitBtn.textContent = 'Creando en WO...';
            const woDoc = await crearDocumentoWO(values);

            // 2. Insertar ID del documento WO en la columna correspondiente
            const docWoIdx = sheetMeta.headers.findIndex(h =>
                h.toLowerCase().includes('documento') && h.toLowerCase().includes('wo')
            );
            if (docWoIdx !== -1 && woDoc) {
                values[docWoIdx] = woDoc.numero
                    ? `${woDoc.prefijo?.nombre || ''}${woDoc.numero}`
                    : String(woDoc.id || '');
            }

            // 3. Guardar en Google Sheets
            submitBtn.textContent = 'Guardando en Sheet...';
            const res = await fetch('/api/finanzas/sheet/ingresos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` },
                body: JSON.stringify({ values })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al guardar en Sheet');

            closeFacturaModal();
            sheetMeta.headers.forEach((_, idx) => {
                const el = document.getElementById(`venta_col_${idx}`);
                if (el) el.value = '';
            });
            showIngresosStatus('Factura creada en WO y guardada en Google Sheets.');
        } catch (err) {
            alert(err.message || 'Error al guardar la factura.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
        }
    }

    function closeFacturaModal() {
        document.getElementById('modalFacturaVenta').style.display = 'none';
    }

    async function loadVentasHistory(month, year) {
        const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        document.getElementById('ventasViewTitle').textContent = `Historial — ${MESES[month - 1]} ${year}`;

        const loadingEl = document.getElementById('ventasTableLoading');
        const errorEl   = document.getElementById('ventasTableError');
        const thead     = document.querySelector('#tablaVentas thead tr');
        const tbody     = document.querySelector('#tablaVentas tbody');

        loadingEl.classList.remove('finanzas--hidden');
        errorEl.classList.add('finanzas--hidden');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        try {
            const res = await fetch(`/api/finanzas/sheet/ingresos?year=${year}&month=${month}`, {
                headers: { 'Authorization': `Bearer ${currentUser.token}` }
            });
            if (!res.ok) throw new Error('Error al cargar el historial');
            const data = await res.json();

            loadingEl.classList.add('finanzas--hidden');

            // Localizar columnas Año / Mes / Día para combinarlas en Fecha
            const iAnio = data.headers.findIndex(h => h.toLowerCase().trim() === 'año');
            const iMes  = data.headers.findIndex(h => h.toLowerCase().trim() === 'mes');
            const iDia  = data.headers.findIndex(h => h.toLowerCase().trim() === 'día' || h.toLowerCase().trim() === 'dia');
            const dateCols = new Set([iAnio, iMes, iDia].filter(i => i !== -1));

            // Filter out hidden columns AND the separate date columns
            const visibleIdx = data.headers
                .map((h, i) => ({ h, i }))
                .filter(({ h, i }) => !isHiddenCol(h.toLowerCase().trim()) && !dateCols.has(i))
                .map(({ i }) => i);

            // Header row: Fecha first, then the rest
            const hasDateCols = dateCols.size > 0;
            const fechaHeader = hasDateCols ? '<th>Fecha</th>' : '';
            thead.innerHTML = '<th>#</th>' + fechaHeader + visibleIdx.map(i => `<th>${escapeHtml(data.headers[i])}</th>`).join('');

            if (!data.rows || data.rows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="${visibleIdx.length + (hasDateCols ? 2 : 1)}" style="text-align:center;color:var(--gray-600);padding:20px;">Sin ventas registradas en este período</td></tr>`;
                return;
            }

            data.rows.forEach((row, idx) => {
                const tr = document.createElement('tr');
                let cells = `<td>${idx + 1}</td>`;

                // Columna Fecha combinada (Año/Mes/Día)
                if (hasDateCols) {
                    const anio = (iAnio !== -1 ? row.cells[iAnio] : '') || '';
                    const mes  = (iMes  !== -1 ? row.cells[iMes]  : '') || '';
                    const dia  = (iDia  !== -1 ? row.cells[iDia]  : '') || '';
                    let fechaDisplay = '';
                    if (anio || mes || dia) {
                        const yy = String(anio).padStart(4, '0');
                        const mm = String(mes).padStart(2, '0');
                        const dd = String(dia).padStart(2, '0');
                        fechaDisplay = `${yy}/${mm}/${dd}`;
                    }
                    cells += `<td>${escapeHtml(fechaDisplay)}</td>`;
                }

                visibleIdx.forEach(i => {
                    const isCurrency = data.currencyColumns && data.currencyColumns.includes(i);
                    const val = row.cells[i] || '';
                    const display = isCurrency && val ? formatCurrency(parseCurrencyClient(val)) : escapeHtml(val);
                    cells += `<td>${display}</td>`;
                });
                tr.innerHTML = cells;
                tbody.appendChild(tr);
            });

        } catch (err) {
            loadingEl.classList.add('finanzas--hidden');
            errorEl.textContent = err.message;
            errorEl.classList.remove('finanzas--hidden');
        }
    }

    async function crearDocumentoWO(values) {
        const headers = sheetMeta.headers;

        const get = (name) => {
            const idx = headers.findIndex(h => h.toLowerCase().trim() === name.toLowerCase().trim());
            return idx !== -1 ? (values[idx] || '') : '';
        };

        const clienteId = get('ID');
        const medioPago = get('Medio de pago');
        const fechaHoy  = new Date().toISOString().slice(0, 10);

        // Construir renglones según producto
        let renglones = [];

        if (isVentaMostradorActiva()) {
            // Mostrador: items individuales con idInventario de .env
            document.querySelectorAll('.mostrador-item').forEach(row => {
                if (!row.querySelector('.mostrador-check').checked) return;
                const qty   = parseFloat(row.querySelector('.mostrador-qty').value)   || 0;
                const price = parseFloat(row.querySelector('.mostrador-price').value) || 0;
                if (!qty) return;
                const prod = row.dataset.product;
                const envKey = {
                    'Botella Aqua':  process.env.WO_INV_BOTELLA_AQUA,
                    'Monster':       process.env.WO_INV_MONSTER,
                    'Cerveza Pilsen': process.env.WO_INV_CERVEZA_PILSEN
                }[prod]; // will be undefined on frontend; resolved server-side
                renglones.push({ concepto: prod, cantidad: qty, valorUnitario: price, idInventario: null, _prodName: prod });
            });
        } else {
            // Producto genérico: un solo renglón
            const valorBruto = parseFloat(get('Valor bruto')) || 0;
            renglones.push({
                concepto: get('Producto') || 'Venta',
                cantidad: 1,
                valorUnitario: valorBruto,
                idInventario: null,
                _prodName: get('Producto')
            });
        }

        const res = await fetch('/api/wo/documento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` },
            body: JSON.stringify({ fecha: fechaHoy, clienteId, medioPago, renglones, concepto: get('Producto') || 'Venta Sweet Garden' })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al crear documento en WO');
        return data.documento;
    }

    function isVentaMostradorActiva() {
        const productoIdx = sheetMeta.headers.findIndex(h => h.toLowerCase().trim().includes('producto'));
        if (productoIdx === -1) return false;
        const el = document.getElementById(`venta_col_${productoIdx}`);
        return el && el.value.toLowerCase().includes('mostrador');
    }

    function showIngresosStatus(msg) {
        const el = document.getElementById('ingresosStatus');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('finanzas__save-status--saving');
        setTimeout(() => { el.textContent = ''; el.classList.remove('finanzas__save-status--saving'); }, 3000);
    }

    document.addEventListener('DOMContentLoaded', () => { initMobileNav(); init(); initAgenda(); initVentas(); });
})();
