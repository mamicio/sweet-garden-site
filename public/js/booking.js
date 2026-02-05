// ====== Sweet Garden — Booking Widget ======

(function () {
    'use strict';

    const PLAN_LABELS = {
        flash: 'Flash — 2 horas',
        plus: 'Plus — Jornada completa'
    };

    const PLAN_PRICES = {
        flash: '$120.000',
        plus: '$320.000'
    };

    const BookingWidget = {
        state: {
            bookingType: null, // 'artist' or 'client'
            planType: null,    // 'flash' or 'plus'
            date: null,
            slot: null
        },

        init() {
            this.bindEvents();
            this.setMinDate();
        },

        // Set date input minimum to today
        setMinDate() {
            const dateInput = document.getElementById('bookingDate');
            if (dateInput) {
                const today = new Date();
                // Format as YYYY-MM-DD in local time
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                dateInput.min = `${yyyy}-${mm}-${dd}`;
            }
        },

        bindEvents() {
            // Plan selection buttons
            document.querySelectorAll('.booking-type-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.state.bookingType = btn.dataset.type;
                    this.state.planType = btn.dataset.plan;
                    this.goToStep(2);
                });
            });

            // "Agenda como cliente" link
            const clientBtn = document.querySelector('.booking-link-btn');
            if (clientBtn) {
                clientBtn.addEventListener('click', () => {
                    this.state.bookingType = clientBtn.dataset.type;
                    this.state.planType = clientBtn.dataset.plan;
                    this.goToStep(2);
                });
            }

            // Date selection
            const dateInput = document.getElementById('bookingDate');
            if (dateInput) {
                dateInput.addEventListener('change', () => {
                    if (dateInput.value) {
                        this.state.date = dateInput.value;
                        this.goToStep(3);
                        this.loadSlots();
                    }
                });
            }

            // Back buttons
            document.querySelectorAll('.booking-back').forEach(btn => {
                btn.addEventListener('click', () => {
                    const target = parseInt(btn.dataset.goto, 10);
                    this.goToStep(target);
                });
            });

            // Form submission
            const form = document.getElementById('bookingForm');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.submitBooking();
                });
            }

            // Reset button (confirmation screen)
            const resetBtn = document.getElementById('bookingResetBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => this.reset());
            }
        },

        goToStep(step) {
            document.querySelectorAll('.booking-step').forEach(el => {
                el.classList.add('booking-step--hidden');
            });
            const target = document.getElementById(`bookingStep${step}`);
            if (target) {
                target.classList.remove('booking-step--hidden');
            }

            // Update displays when entering certain steps
            if (step === 3) {
                this.updateDateDisplay();
            }
            if (step === 4) {
                this.updateSummary();
            }
        },

        updateDateDisplay() {
            const el = document.getElementById('bookingDateDisplay');
            if (el && this.state.date) {
                const d = new Date(this.state.date + 'T12:00:00');
                const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                el.textContent = d.toLocaleDateString('es-CO', options);
            }
        },

        updateSummary() {
            const el = document.getElementById('bookingSummary');
            if (!el) return;

            const d = new Date(this.state.date + 'T12:00:00');
            const dateStr = d.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            el.innerHTML = `
                <div class="booking-summary__item">
                    <strong>Plan:</strong> ${PLAN_LABELS[this.state.planType]} (${PLAN_PRICES[this.state.planType]})
                </div>
                <div class="booking-summary__item">
                    <strong>Fecha:</strong> ${dateStr}
                </div>
                <div class="booking-summary__item">
                    <strong>Horario:</strong> ${this.state.slot.start} — ${this.state.slot.end}
                </div>
            `;
        },

        async loadSlots() {
            const container = document.getElementById('slotsContainer');
            const loading = document.getElementById('slotsLoading');
            const errorEl = document.getElementById('slotsError');

            container.innerHTML = '';
            loading.classList.remove('booking-step--hidden');
            errorEl.classList.add('booking-step--hidden');

            try {
                const res = await fetch(`/api/availability?date=${this.state.date}&plan=${this.state.planType}`);

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Error al consultar disponibilidad');
                }

                const slots = await res.json();
                loading.classList.add('booking-step--hidden');

                if (slots.length === 0) {
                    errorEl.textContent = 'No hay disponibilidad para esta fecha. Intenta otro día.';
                    errorEl.classList.remove('booking-step--hidden');
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
                    `;
                    btn.addEventListener('click', () => {
                        document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('slot-btn--selected'));
                        btn.classList.add('slot-btn--selected');
                        this.state.slot = slot;
                        setTimeout(() => this.goToStep(4), 250);
                    });
                    container.appendChild(btn);
                });
            } catch (err) {
                loading.classList.add('booking-step--hidden');
                errorEl.textContent = err.message || 'Error de conexión. Intenta nuevamente.';
                errorEl.classList.remove('booking-step--hidden');
            }
        },

        async submitBooking() {
            const submitBtn = document.getElementById('bookingSubmit');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Reservando...';

            const data = {
                bookingType: this.state.bookingType,
                planType: this.state.planType,
                date: this.state.date,
                slot: this.state.slot,
                name: document.getElementById('bookingName').value.trim(),
                email: document.getElementById('bookingEmail').value.trim(),
                phone: document.getElementById('bookingPhone').value.trim(),
                notes: document.getElementById('bookingNotes').value.trim()
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
                this.showConfirmation(data);
            } catch (err) {
                alert(err.message || 'Error al crear la reserva. Intenta nuevamente.');
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        },

        showConfirmation(data) {
            const details = document.getElementById('confirmationDetails');
            const d = new Date(data.date + 'T12:00:00');
            const dateStr = d.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            details.innerHTML = `
                <p><strong>${data.name}</strong></p>
                <p>${PLAN_LABELS[data.planType]} — ${dateStr}</p>
                <p>${data.slot.start} — ${data.slot.end}</p>
            `;

            this.goToStep(5);
        },

        reset() {
            this.state = { bookingType: null, planType: null, date: null, slot: null };
            document.getElementById('bookingForm').reset();
            document.getElementById('bookingDate').value = '';
            document.getElementById('slotsContainer').innerHTML = '';
            this.goToStep(1);
        }
    };

    // Expose for the reset button
    window.BookingWidget = BookingWidget;

    document.addEventListener('DOMContentLoaded', () => BookingWidget.init());
})();
