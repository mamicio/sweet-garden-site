const { google } = require('googleapis');

let sheets = null;

function getSheetsClient() {
    if (sheets) return sheets;

    const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!encoded) {
        console.warn('GOOGLE_SERVICE_ACCOUNT_JSON not set — sheets features disabled');
        return null;
    }

    const credentials = JSON.parse(
        Buffer.from(encoded, 'base64').toString('utf-8')
    );

    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    sheets = google.sheets({ version: 'v4', auth });
    return sheets;
}

// Spreadsheet IDs from environment
const INGRESOS_SHEET_ID = process.env.INGRESOS_SHEET_ID;
const EGRESOS_SHEET_ID = process.env.EGRESOS_SHEET_ID;

// Parse Colombian currency format (e.g., "$1.234.567" or "1234567")
function parseCurrency(value) {
    if (!value) return 0;
    // Remove currency symbol, spaces, and thousand separators (dots in Colombian format)
    const cleaned = String(value).replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
}

// Find column index by header name (case-insensitive, trimmed)
function findColumnIndex(headers, columnName) {
    const normalizedName = columnName.toLowerCase().trim();
    const index = headers.findIndex(h =>
        h && h.toString().toLowerCase().trim() === normalizedName
    );
    return index;
}

// Authorized emails for finance section (from environment variable, comma-separated)
const AUTHORIZED_EMAILS = (process.env.AUTHORIZED_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

function isAuthorizedEmail(email) {
    return AUTHORIZED_EMAILS.includes(email?.toLowerCase());
}

async function getIngresos(year, month) {
    const client = getSheetsClient();
    if (!client) {
        throw new Error('Google Sheets not configured');
    }

    console.log(`[Ingresos] Fetching data for ${year}-${month}...`);

    const response = await client.spreadsheets.values.get({
        spreadsheetId: INGRESOS_SHEET_ID,
        range: 'Facturacion!A1:Z'
    });

    const rows = response.data.values || [];
    console.log(`[Ingresos] Found ${rows.length} rows`);

    if (rows.length <= 1) return [];

    const headers = rows[0];
    const data = rows.slice(1);

    console.log('[Ingresos] Headers found:', headers);

    // Find column indices by header name
    const colYear = findColumnIndex(headers, 'Año');
    const colMonth = findColumnIndex(headers, 'Mes');
    const colDay = findColumnIndex(headers, 'Día');
    const colValorNeto = findColumnIndex(headers, 'Valor neto');

    // Optional columns for display (try both singular and plural versions)
    let colNombre = findColumnIndex(headers, 'Nombre');
    if (colNombre === -1) colNombre = findColumnIndex(headers, 'Nombres');
    let colApellido = findColumnIndex(headers, 'Apellido');
    if (colApellido === -1) colApellido = findColumnIndex(headers, 'Apellidos');
    const colProducto = findColumnIndex(headers, 'Producto');

    console.log('[Ingresos] Column indices:', { colYear, colMonth, colDay, colValorNeto, colNombre, colApellido, colProducto });

    // Validate required columns exist
    if (colYear === -1 || colMonth === -1 || colDay === -1 || colValorNeto === -1) {
        console.error('Ingresos: Missing required columns. Found headers:', headers);
        const missing = [];
        if (colYear === -1) missing.push('Año');
        if (colMonth === -1) missing.push('Mes');
        if (colDay === -1) missing.push('Día');
        if (colValorNeto === -1) missing.push('Valor neto');
        throw new Error(`Columnas faltantes en Ingresos: ${missing.join(', ')}`);
    }

    const filtered = data
        .filter(row => {
            const rowYear = parseInt(row[colYear]);
            const rowMonth = parseInt(row[colMonth]);
            return rowYear === year && rowMonth === month;
        })
        .map(row => ({
            dia: row[colDay] || '',
            nombre: colNombre !== -1 && colApellido !== -1
                ? `${row[colNombre] || ''} ${row[colApellido] || ''}`.trim()
                : (colNombre !== -1 ? row[colNombre] || '' : ''),
            producto: colProducto !== -1 ? row[colProducto] || '' : '',
            valorNeto: parseCurrency(row[colValorNeto])
        }));

    return filtered;
}

async function getEgresos(year, month) {
    const client = getSheetsClient();
    if (!client) {
        throw new Error('Google Sheets not configured');
    }

    console.log(`[Egresos] Fetching data for ${year}-${month}...`);

    const response = await client.spreadsheets.values.get({
        spreadsheetId: EGRESOS_SHEET_ID,
        range: 'Transacciones!A1:Z'
    });

    const rows = response.data.values || [];
    console.log(`[Egresos] Found ${rows.length} rows`);

    if (rows.length <= 1) return [];

    const headers = rows[0];
    const data = rows.slice(1);

    console.log('[Egresos] Headers found:', headers);

    // Find column indices by header name
    const colYear = findColumnIndex(headers, 'Año');
    const colMonth = findColumnIndex(headers, 'Mes');
    const colDay = findColumnIndex(headers, 'Día');
    const colValor = findColumnIndex(headers, 'Valor Unitario');

    // Optional columns for display
    const colComercio = findColumnIndex(headers, 'Comercio');
    const colConcepto = findColumnIndex(headers, 'Concepto');

    console.log('[Egresos] Column indices:', { colYear, colMonth, colDay, colValor, colComercio, colConcepto });

    // Validate required columns exist
    if (colYear === -1 || colMonth === -1 || colDay === -1 || colValor === -1) {
        console.error('Egresos: Missing required columns. Found headers:', headers);
        const missing = [];
        if (colYear === -1) missing.push('Año');
        if (colMonth === -1) missing.push('Mes');
        if (colDay === -1) missing.push('Día');
        if (colValor === -1) missing.push('Valor Unitario');
        throw new Error(`Columnas faltantes en Egresos: ${missing.join(', ')}`);
    }

    const filtered = data
        .filter(row => {
            const rowYear = parseInt(row[colYear]);
            const rowMonth = parseInt(row[colMonth]);
            return rowYear === year && rowMonth === month;
        })
        .map(row => ({
            dia: row[colDay] || '',
            comercio: colComercio !== -1 ? row[colComercio] || '' : '',
            concepto: colConcepto !== -1 ? row[colConcepto] || '' : '',
            valor: parseCurrency(row[colValor])
        }));

    return filtered;
}

async function getFinanzasResumen(year, month) {
    const [ingresos, egresos] = await Promise.all([
        getIngresos(year, month),
        getEgresos(year, month)
    ]);

    const totalIngresos = ingresos.reduce((sum, i) => sum + i.valorNeto, 0);
    const totalEgresos = egresos.reduce((sum, e) => sum + e.valor, 0);
    const flujoCaja = totalIngresos - totalEgresos;

    return {
        ingresos,
        egresos,
        resumen: {
            totalIngresos,
            totalEgresos,
            flujoCaja
        }
    };
}

module.exports = {
    isAuthorizedEmail,
    getIngresos,
    getEgresos,
    getFinanzasResumen
};
