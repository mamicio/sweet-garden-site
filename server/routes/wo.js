// ====== WorldOffice Routes ======

const express = require('express');
const router  = express.Router();
const {
    listarPrefijoDocumento,
    listarFormaPago,
    listarMonedas,
    listarBodegas,
    listarInventarios,
    listarEmpresas,
    listarTiposDocumento,
    listarUnidadesMedida,
    listarCentrosCosto,
    tiposIdentificacion,
    buscarTerceroPorIdentificacion,
    buscarTerceroPorIdentificacionGet,
    crearTercero,
    crearDocumentoVenta
} = require('../services/woService');
const { verifySessionToken, isAuthorizedEmail } = require('../services/authService');

// Auth middleware (reuse same pattern as api.js)
function requireAuth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requerido' });
    try {
        const decoded = verifySessionToken(token);
        if (!isAuthorizedEmail(decoded.email)) return res.status(403).json({ error: 'No autorizado' });
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ error: 'Sesión inválida' });
    }
}

// ====== Setup helpers — sin auth, solo para localhost ======

router.get('/setup/prefijos',        async (_, res) => { try { res.json(await listarPrefijoDocumento()); } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/setup/formas-pago',     async (_, res) => { try { res.json(await listarFormaPago());        } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/setup/monedas',         async (_, res) => { try { res.json(await listarMonedas());          } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/setup/bodegas',         async (_, res) => { try { res.json(await listarBodegas());          } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/setup/empresas',        async (_, res) => { try { res.json(await listarEmpresas());         } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/setup/tipos-documento', async (_, res) => { try { res.json(await listarTiposDocumento());   } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/setup/unidades-medida', async (_, res) => { try { res.json(await listarUnidadesMedida());   } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/setup/centros-costo',   async (_, res) => { try { res.json(await listarCentrosCosto());     } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/setup/tipos-id',        async (_, res) => { try { res.json(await tiposIdentificacion());    } catch (e) { res.status(500).json({ error: e.message }); } });
router.get('/setup/inventarios',     async (req, res) => { try { res.json(await listarInventarios(req.query.q || '')); } catch (e) { res.status(500).json({ error: e.message }); } });

// Buscar tercero por número de identificación
router.get('/tercero', requireAuth, async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
    try { res.json(await buscarTerceroPorIdentificacion(id)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== Crear documento de venta ======

router.post('/documento', requireAuth, async (req, res) => {
    try {
        const {
            fecha,
            clienteId,         // identificación del cliente (CC/NIT)
            medioPago,         // "Efectivo" | "Ahorros"
            renglones,         // [{ idInventario, cantidad, valorUnitario, concepto }]
            concepto,
            clienteNombre,     // nombre completo del cliente (para crear tercero si no existe)
            clienteTelefono,
            clienteEmail
        } = req.body;

        const missing = [];
        if (!fecha)              missing.push('fecha');
        if (!clienteId)          missing.push('ID del cliente');
        if (!medioPago)          missing.push('Medio de pago');
        if (!renglones?.length)  missing.push('renglones (ningún producto con valor)');
        if (missing.length) {
            return res.status(400).json({ error: `Faltan campos requeridos: ${missing.join(', ')}` });
        }

        // Resolver idTerceroExterno desde WO — si no existe, crearlo automáticamente
        let idTerceroExterno;
        try {
            const tercero = await buscarTerceroPorIdentificacionGet(clienteId);
            idTerceroExterno = tercero?.data?.id;
            if (!idTerceroExterno) throw new Error('No ID');
        } catch {
            // No existe en WO → crearlo automáticamente
            try {
                const nombres = (clienteNombre || '').trim().split(/\s+/);
                const primerNombre = nombres[0] || 'Cliente';
                const primerApellido = nombres.slice(1).join(' ') || 'Sweet Garden';

                const nuevo = await crearTercero({
                    identificacion: clienteId,
                    primerNombre,
                    primerApellido,
                    telefono: clienteTelefono || '',
                    email: clienteEmail || ''
                });
                idTerceroExterno = nuevo?.data?.id;
                if (!idTerceroExterno) throw new Error('No se pudo obtener ID del tercero creado');
            } catch (createErr) {
                return res.status(500).json({
                    error: `No se pudo crear el cliente "${clienteId}" en WO: ${createErr.message}`
                });
            }
        }

        // Resolver idInventario por nombre de producto (IDs fijos de WO)
        const INV_MAP = {
            'venta mostrador':              1004,
            'mostrador':                    1004,
            'arrendamiento tattoo 19%':     1003,
            'arriendo tattoo':              1003,
            'arrendamiento perforaciones 19%': 1002,
            'arriendo perforaciones':       1002,
            'coworking':                    1021,
        };
        const idInventarioGenerico = 1004; // VENTA MOSTRADOR por defecto

        const renglonesResueltos = renglones.map(r => ({
            ...r,
            idInventario: r.idInventario ||
                INV_MAP[(r._prodName || '').toLowerCase().trim()] ||
                idInventarioGenerico
        }));

        if (renglonesResueltos.some(r => !r.idInventario)) {
            return res.status(500).json({ error: 'No se encontró el idInventario para alguno de los productos' });
        }

        // Mapear medio de pago a IDs configurados
        const isAhorro = medioPago.toLowerCase().includes('ahorro');
        const idFormaPago  = isAhorro
            ? parseInt(process.env.WO_ID_FORMA_PAGO_AHORROS)    // 62 Consignación bancaria
            : parseInt(process.env.WO_ID_FORMA_PAGO_EFECTIVO);   // 4  Efectivo - Contado
        const idMedioPago  = isAhorro
            ? parseInt(process.env.WO_ID_MEDIO_PAGO_AHORROS)     // 68 Tarjeta Débito
            : parseInt(process.env.WO_ID_MEDIO_PAGO_EFECTIVO);   // 32 Efectivo

        if (!idFormaPago) {
            return res.status(500).json({ error: 'Configurar WO_ID_FORMA_PAGO_EFECTIVO / WO_ID_FORMA_PAGO_AHORROS en .env' });
        }

        const result = await crearDocumentoVenta({ fecha, idTerceroExterno, idFormaPago, idMedioPago, renglones: renglonesResueltos, concepto });

        res.status(201).json({ success: true, documento: result.data || result });

    } catch (err) {
        console.error('WO crear documento error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
