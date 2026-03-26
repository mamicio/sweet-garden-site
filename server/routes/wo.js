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
            concepto
        } = req.body;

        const missing = [];
        if (!fecha)              missing.push('fecha');
        if (!clienteId)          missing.push('ID del cliente');
        if (!medioPago)          missing.push('Medio de pago');
        if (!renglones?.length)  missing.push('renglones (ningún producto con valor)');
        if (missing.length) {
            return res.status(400).json({ error: `Faltan campos requeridos: ${missing.join(', ')}` });
        }

        // Resolver idTerceroExterno desde WO
        let idTerceroExterno;
        try {
            const tercero = await buscarTerceroPorIdentificacion(clienteId);
            // WO devuelve { data: { content: [...] } }
            const content = tercero?.data?.content || tercero?.data || [];
            const list = Array.isArray(content) ? content : [content];
            const t = list[0];
            idTerceroExterno = t?.id;
            if (!idTerceroExterno) throw new Error('No ID');
        } catch {
            return res.status(404).json({
                error: `Cliente con identificación "${clienteId}" no encontrado en WorldOffice. Créalo primero en WO.`
            });
        }

        // Resolver idInventario por nombre de producto
        const INV_MAP = {
            'botella aqua':   parseInt(process.env.WO_INV_BOTELLA_AQUA),
            'monster':        parseInt(process.env.WO_INV_MONSTER),
            'cerveza pilsen': parseInt(process.env.WO_INV_CERVEZA_PILSEN),
        };
        const idInventarioGenerico = parseInt(process.env.WO_INV_GENERICO);

        const renglonesResueltos = renglones.map(r => ({
            ...r,
            idInventario: r.idInventario ||
                INV_MAP[(r._prodName || '').toLowerCase().trim()] ||
                idInventarioGenerico
        }));

        if (renglonesResueltos.some(r => !r.idInventario)) {
            return res.status(500).json({ error: 'Faltan WO_INV_* en .env para los productos seleccionados' });
        }

        // Mapear medio de pago a ID configurado
        const idFormaPago = medioPago.toLowerCase().includes('ahorro')
            ? parseInt(process.env.WO_ID_FORMA_PAGO_AHORROS)
            : parseInt(process.env.WO_ID_FORMA_PAGO_EFECTIVO);

        if (!idFormaPago) {
            return res.status(500).json({ error: 'Configurar WO_ID_FORMA_PAGO_EFECTIVO / WO_ID_FORMA_PAGO_AHORROS en .env' });
        }

        const result = await crearDocumentoVenta({ fecha, idTerceroExterno, idFormaPago, renglones: renglonesResueltos, concepto });

        res.status(201).json({ success: true, documento: result.data || result });

    } catch (err) {
        console.error('WO crear documento error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
