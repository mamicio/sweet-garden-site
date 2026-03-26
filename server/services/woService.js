// ====== WorldOffice API Service ======

const WO_BASE  = 'https://api.worldoffice.cloud/api/v1';
const WO_TOKEN = process.env.WO_API_TOKEN;

async function woFetch(path, options = {}) {
    if (!WO_TOKEN) throw new Error('WO_API_TOKEN no configurado en .env');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    // WO API requiere POST sin prefijo Bearer; body vacío {} si no se pasa
    const method = options.method || 'POST';
    const body = options.body !== undefined ? options.body : (method === 'POST' ? '{}' : undefined);

    try {
        const fetchOpts = {
            method,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': WO_TOKEN,
                'Accept': 'application/json',
                ...(options.headers || {})
            }
        };
        if (body !== undefined) fetchOpts.body = body;

        const res = await fetch(`${WO_BASE}${path}`, fetchOpts);

        const resBody = await res.json().catch(() => ({}));

        if (!res.ok) {
            const msgs = Array.isArray(resBody?.developerMessage)
                ? resBody.developerMessage.join('; ')
                : resBody?.developerMessage || resBody?.message || resBody?.detail || `WO API error ${res.status}`;
            throw new Error(msgs);
        }

        return resBody;
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('WO API timeout — no respondió en 15 segundos');
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

// ====== Config helpers (para descubrir IDs en tu cuenta WO) ======

async function listarPrefijoDocumento() {
    return woFetch('/documentosTipos/listarPrefijoDocumento');
}

async function listarFormaPago() {
    return woFetch('/formasDePago/listarFormaPagoDocumento');
}

async function listarMonedas() {
    return woFetch('/monedas/listarMonedas');
}

async function listarBodegas() {
    return woFetch('/bodegas/listarBodega');
}

async function listarInventarios(filtro = '') {
    return woFetch('/inventarios/listarInventarios', {
        body: JSON.stringify(filtro ? { nombre: filtro } : {})
    });
}

async function listarEmpresas() {
    return woFetch('/empresas/listarEmpresas');
}

async function listarTiposDocumento() {
    return woFetch('/documentosTipos/listarTipoDocumento');
}

async function listarUnidadesMedida() {
    return woFetch('/unidadesDeMedida/listarUnidadMedida');
}

async function listarCentrosCosto() {
    return woFetch('/centrosDeCosto/listarCentroCosto');
}

async function tiposIdentificacion() {
    return woFetch('/terceros/tiposIdentificacion');
}

// ====== Tercero lookup ======

async function buscarTerceroPorIdentificacion(identificacion) {
    return woFetch('/terceros/listarTerceros', {
        body: JSON.stringify({ identificacion: String(identificacion) })
    });
}

async function buscarTerceroPorIdentificacionGet(identificacion) {
    return woFetch(`/terceros/identificacion/${encodeURIComponent(identificacion)}`, {
        method: 'GET'
    });
}

// ====== Crear tercero ======

async function crearTercero({ identificacion, primerNombre, primerApellido, telefono, email, direccion, idCiudad }) {
    return woFetch('/terceros/crearTercero', {
        body: JSON.stringify({
            idTerceroTipoIdentificacion: 3,   // CC - Cédula de Ciudadanía
            identificacion: String(identificacion),
            primerNombre:   primerNombre || 'Cliente',
            primerApellido: primerApellido || 'Sweet Garden',
            idCiudad:       idCiudad || 59,   // Itagüí por defecto
            direccion:      direccion || 'Sin dirección',
            telefono:       telefono || '0000000000',
            email:          email || 'sin@email.com',
            idTerceroTipos: [4],              // Cliente
            responsabilidadFiscal: [5],       // R-99-PN No Aplica (Persona Natural)
            idClasificacionImpuestos: 1,
            idTerceroTipoContribuyente: 6,    // Persona Natural No Responsable del IVA
            plazoDias: 1
        })
    });
}

// ====== Crear documento de venta ======

async function crearDocumentoVenta({ fecha, idTerceroExterno, idFormaPago, idMedioPago, renglones, concepto }) {
    const cfg = {
        idEmpresa:            parseInt(process.env.WO_ID_EMPRESA),
        prefijo:              parseInt(process.env.WO_PREFIJO_FV),
        idTerceroInterno:     1030,  // Vendedor: Esteban Hincapíé García (CC 1035867387)
        idMoneda:             31,    // COP - Peso Colombiano
        idBodega:             parseInt(process.env.WO_ID_BODEGA),
    };

    // Validar que la config mínima esté presente
    const missing = Object.entries(cfg).filter(([, v]) => !v || isNaN(v)).map(([k]) => k);
    if (missing.length) throw new Error(`Faltan variables WO en .env: ${missing.join(', ')}`);

    const payload = {
        fecha,
        prefijo:                     cfg.prefijo,
        documentoTipo:               'FV',
        concepto:                    concepto || 'Venta Sweet Garden',
        idEmpresa:                   cfg.idEmpresa,
        idTerceroExterno:            idTerceroExterno,
        idTerceroInterno:            cfg.idTerceroInterno,
        idFormaPago:                 idFormaPago,
        idMoneda:                    cfg.idMoneda,
        trm:                         1,
        porcentajeDescuento:         false,
        porcentajeTodosRenglones:    false,
        valDescuento:                0,
        reglones: renglones.map(r => ({
            idInventario:   r.idInventario,
            unidadMedida:   r.unidadMedida || 'und',
            cantidad:       r.cantidad,
            valorUnitario:  r.valorUnitario,
            idBodega:       cfg.idBodega,
            porDescuento:   0,
            concepto:       r.concepto || ''
        }))
    };

    // Agregar mediosPago si se proporciona el id
    if (idMedioPago) {
        const valorTotal = renglones.reduce((s, r) => s + (r.cantidad * r.valorUnitario), 0);
        payload.mediosPago = [{ idMedioPago, valor: valorTotal }];
    }

    return woFetch('/documentos/crearDocumentoVenta', {
        body: JSON.stringify(payload)
    });
}

module.exports = {
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
};
