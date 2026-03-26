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
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    sheets = google.sheets({ version: 'v4', auth });
    return sheets;
}

// Spreadsheet IDs from environment
const INGRESOS_SHEET_ID = process.env.INGRESOS_SHEET_ID;
const EGRESOS_SHEET_ID = process.env.EGRESOS_SHEET_ID;

// Sheet configuration
const SHEET_CONFIG = {
    ingresos: {
        spreadsheetId: INGRESOS_SHEET_ID,
        range: 'Facturacion!A1:Z',
        sheetName: 'Facturacion',
        currencyHeaders: ['Valor bruto', 'Valor sin Iva', 'Vlr ant de IVA', 'Valor neto']
    },
    egresos: {
        spreadsheetId: EGRESOS_SHEET_ID,
        range: 'Transacciones!A1:Z',
        sheetName: 'Transacciones',
        currencyHeaders: ['Valor', 'Valor Unitario']
    }
};

// Parse Colombian currency format (e.g., "$1.234.567" or "1234567")
function parseCurrency(value) {
    if (!value) return 0;
    const cleaned = String(value).replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
}

// Find column index by header name (case-insensitive, trimmed)
function findColumnIndex(headers, columnName) {
    const normalizedName = columnName.toLowerCase().trim();
    return headers.findIndex(h =>
        h && h.toString().toLowerCase().trim() === normalizedName
    );
}

// Convert 0-based column index to A1 notation letter (0=A, 1=B, ..., 25=Z)
function columnIndexToLetter(index) {
    let letter = '';
    let i = index;
    while (i >= 0) {
        letter = String.fromCharCode(65 + (i % 26)) + letter;
        i = Math.floor(i / 26) - 1;
    }
    return letter;
}

// Authorized emails
const AUTHORIZED_EMAILS = (process.env.AUTHORIZED_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

function isAuthorizedEmail(email) {
    return AUTHORIZED_EMAILS.includes(email?.toLowerCase());
}

// ====== Full sheet read (all columns, filtered by year/month) ======

async function getFullSheet(sheetType, year, month) {
    const client = getSheetsClient();
    if (!client) throw new Error('Google Sheets not configured');

    const config = SHEET_CONFIG[sheetType];
    if (!config) throw new Error('Tipo de hoja inválido');

    const response = await client.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: config.range
    });

    const allRows = response.data.values || [];
    if (allRows.length === 0) return { headers: [], rows: [], currencyColumns: [] };

    const headers = allRows[0];
    if (allRows.length <= 1) return { headers, rows: [], currencyColumns: [] };

    const colYear = findColumnIndex(headers, 'Año');
    const colMonth = findColumnIndex(headers, 'Mes');

    // Identify currency columns for frontend formatting
    const currencyColumns = config.currencyHeaders
        .map(name => findColumnIndex(headers, name))
        .filter(i => i !== -1);

    // Filter by year/month, preserve sheet row indices
    const rows = [];
    for (let i = 1; i < allRows.length; i++) {
        const row = allRows[i];
        const rowYear = parseInt(row[colYear]);
        const rowMonth = parseInt(row[colMonth]);
        if (rowYear === year && rowMonth === month) {
            // Pad row to match header length (Sheets API omits trailing empty cells)
            const cells = Array.from({ length: headers.length }, (_, j) => row[j] || '');
            rows.push({ rowIndex: i + 1, cells }); // i+1 because sheets are 1-indexed, header is row 1
        }
    }

    return { headers, rows, currencyColumns };
}

// ====== Single cell update ======

async function updateCell(sheetType, rowIndex, colIndex, value) {
    const client = getSheetsClient();
    if (!client) throw new Error('Google Sheets not configured');

    const config = SHEET_CONFIG[sheetType];
    if (!config) throw new Error('Tipo de hoja inválido');

    const colLetter = columnIndexToLetter(colIndex);
    const cellRange = `${config.sheetName}!${colLetter}${rowIndex}`;

    await client.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: cellRange,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[value]] }
    });

    return { range: cellRange, value };
}

// ====== Append row ======

async function appendRow(sheetType, cellValues) {
    const client = getSheetsClient();
    if (!client) throw new Error('Google Sheets not configured');

    const config = SHEET_CONFIG[sheetType];
    if (!config) throw new Error('Tipo de hoja inválido');

    const response = await client.spreadsheets.values.append({
        spreadsheetId: config.spreadsheetId,
        range: config.range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [cellValues] }
    });

    // Extract new row index from the updated range
    const updatedRange = response.data.updates.updatedRange || '';
    const match = updatedRange.match(/(\d+)/g);
    const newRowIndex = match ? parseInt(match[match.length - 1]) : null;

    return { rowIndex: newRowIndex, cells: cellValues };
}

// ====== Existing summary functions (kept for summary cards) ======

async function getIngresos(year, month) {
    const client = getSheetsClient();
    if (!client) throw new Error('Google Sheets not configured');

    const response = await client.spreadsheets.values.get({
        spreadsheetId: INGRESOS_SHEET_ID,
        range: 'Facturacion!A1:Z'
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    const headers = rows[0];
    const data = rows.slice(1);

    const colYear = findColumnIndex(headers, 'Año');
    const colMonth = findColumnIndex(headers, 'Mes');
    const colValorNeto = findColumnIndex(headers, 'Valor neto');

    if (colYear === -1 || colMonth === -1 || colValorNeto === -1) return [];

    return data
        .filter(row => parseInt(row[colYear]) === year && parseInt(row[colMonth]) === month)
        .map(row => ({ valorNeto: parseCurrency(row[colValorNeto]) }));
}

async function getEgresos(year, month) {
    const client = getSheetsClient();
    if (!client) throw new Error('Google Sheets not configured');

    const response = await client.spreadsheets.values.get({
        spreadsheetId: EGRESOS_SHEET_ID,
        range: 'Transacciones!A1:Z'
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    const headers = rows[0];
    const data = rows.slice(1);

    const colYear = findColumnIndex(headers, 'Año');
    const colMonth = findColumnIndex(headers, 'Mes');
    const colValor = findColumnIndex(headers, 'Valor Unitario');

    if (colYear === -1 || colMonth === -1 || colValor === -1) return [];

    return data
        .filter(row => parseInt(row[colYear]) === year && parseInt(row[colMonth]) === month)
        .map(row => ({ valor: parseCurrency(row[colValor]) }));
}

async function getFinanzasResumen(year, month) {
    const [ingresos, egresos] = await Promise.all([
        getIngresos(year, month),
        getEgresos(year, month)
    ]);

    const totalIngresos = ingresos.reduce((sum, i) => sum + i.valorNeto, 0);
    const totalEgresos = egresos.reduce((sum, e) => sum + e.valor, 0);

    return {
        resumen: {
            totalIngresos,
            totalEgresos,
            flujoCaja: totalIngresos - totalEgresos
        }
    };
}

async function getAllRows(sheetType) {
    const client = getSheetsClient();
    if (!client) throw new Error('Google Sheets not configured');

    const config = SHEET_CONFIG[sheetType];
    if (!config) throw new Error('Tipo de hoja inválido');

    const response = await client.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: config.range
    });

    const allRows = response.data.values || [];
    if (allRows.length < 2) return { headers: allRows[0] || [], rows: [] };

    const headers = allRows[0];
    const rows = allRows.slice(1).map((row, i) => ({
        rowIndex: i + 2,
        cells: Array.from({ length: headers.length }, (_, j) => row[j] || '')
    }));

    return { headers, rows };
}

async function getSheetHeaders(sheetType) {
    const client = getSheetsClient();
    if (!client) throw new Error('Google Sheets not configured');

    const config = SHEET_CONFIG[sheetType];
    if (!config) throw new Error('Tipo de hoja inválido');

    const response = await client.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!1:1`
    });

    const headers = response.data.values?.[0] || [];
    const currencyHeaders = config.currencyHeaders || [];
    return { headers, currencyHeaders };
}

// Insert a new row at position 2 (after header), pushing existing data down
async function insertRowAt2(sheetType, cellValues) {
    const client = getSheetsClient();
    if (!client) throw new Error('Google Sheets not configured');

    const config = SHEET_CONFIG[sheetType];
    if (!config) throw new Error('Tipo de hoja inválido');

    // Get numeric sheet ID (gid) for batchUpdate
    const spreadsheet = await client.spreadsheets.get({
        spreadsheetId: config.spreadsheetId,
        fields: 'sheets.properties'
    });
    const sheet = spreadsheet.data.sheets.find(s => s.properties.title === config.sheetName);
    if (!sheet) throw new Error(`Hoja "${config.sheetName}" no encontrada`);
    const sheetId = sheet.properties.sheetId;

    // 1. Insert blank row at index 1 (row 2, 0-based)
    await client.spreadsheets.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody: {
            requests: [{
                insertDimension: {
                    range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
                    inheritFromBefore: false
                }
            }]
        }
    });

    // 2. Write data into the new row 2
    const lastCol = columnIndexToLetter(cellValues.length - 1);
    await client.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!A2:${lastCol}2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [cellValues] }
    });

    return { rowIndex: 2, cells: cellValues };
}

// ====== Productos (pestaña "Productos" en Ingresos sheet) ======

async function getProductos() {
    const client = getSheetsClient();
    if (!client) throw new Error('Google Sheets not configured');

    const response = await client.spreadsheets.values.get({
        spreadsheetId: INGRESOS_SHEET_ID,
        range: 'Productos!A:B'
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    // Skip header row, return [{nombre, valor}]
    return rows.slice(1)
        .filter(r => r[0] && r[0].trim())
        .map(r => ({
            nombre: r[0].trim(),
            valor: parseFloat((r[1] || '0').toString().replace(/[.,]/g, '')) || 0
        }));
}

async function addProducto(nombre, valor) {
    const client = getSheetsClient();
    if (!client) throw new Error('Google Sheets not configured');

    await client.spreadsheets.values.append({
        spreadsheetId: INGRESOS_SHEET_ID,
        range: 'Productos!A:B',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[nombre, valor]] }
    });

    return { nombre, valor };
}

// ====== Proteger rangos ======

async function protegerHoja(sheetType, editorEmails) {
    const client = getSheetsClient();
    if (!client) throw new Error('Google Sheets not configured');

    const config = SHEET_CONFIG[sheetType];
    if (!config) throw new Error('Tipo de hoja inválido');

    // Obtener sheetId y headers
    const spreadsheet = await client.spreadsheets.get({
        spreadsheetId: config.spreadsheetId,
        fields: 'sheets.properties,sheets.protectedRanges'
    });
    const sheet = spreadsheet.data.sheets.find(s => s.properties.title === config.sheetName);
    if (!sheet) throw new Error(`Hoja "${config.sheetName}" no encontrada`);
    const sheetId = sheet.properties.sheetId;

    // Leer headers para saber cuántas columnas hay
    const headersRes = await client.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!1:1`
    });
    const headers = headersRes.data.values?.[0] || [];
    const numCols = headers.length;

    // Eliminar protecciones existentes de esta hoja (para no duplicar)
    const existingProtections = sheet.protectedRanges || [];
    if (existingProtections.length > 0) {
        await client.spreadsheets.batchUpdate({
            spreadsheetId: config.spreadsheetId,
            requestBody: {
                requests: existingProtections.map(p => ({
                    deleteProtectedRange: { protectedRangeId: p.protectedRangeId }
                }))
            }
        });
    }

    const requests = [
        // 1. Proteger fila de encabezados (fila 1)
        {
            addProtectedRange: {
                protectedRange: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: numCols },
                    description: 'Encabezados - No modificar',
                    warningOnly: false,
                    editors: { users: editorEmails }
                }
            }
        },
        // 2. Proteger estructura de columnas (no agregar/eliminar columnas)
        {
            addProtectedRange: {
                protectedRange: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: numCols, endColumnIndex: numCols + 10 },
                    description: 'Columnas reservadas - No agregar sin autorización',
                    warningOnly: true,
                    editors: { users: editorEmails }
                }
            }
        }
    ];

    await client.spreadsheets.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody: { requests }
    });

    return { protectedHeaders: headers, numCols, sheets: [config.sheetName] };
}

module.exports = {
    isAuthorizedEmail,
    getFinanzasResumen,
    getFullSheet,
    getAllRows,
    getSheetHeaders,
    updateCell,
    appendRow,
    insertRowAt2,
    getProductos,
    addProducto,
    protegerHoja
};
