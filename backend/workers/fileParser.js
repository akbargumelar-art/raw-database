/**
 * Worker Thread for processing large files
 * This runs in a separate thread to avoid blocking the main Node.js event loop
 */

const { parentPort, workerData } = require('worker_threads');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Utility function to format dates for MySQL
const formatToMysql = (value, isDate = false) => {
    if (value === null || value === undefined || value === '') return null;

    if (isDate) {
        // Handle Excel serial date numbers
        if (typeof value === 'number') {
            const date = new Date((value - 25569) * 86400 * 1000);
            if (!isNaN(date.getTime())) {
                return date.toISOString().slice(0, 19).replace('T', ' ');
            }
        }

        // Handle date strings
        if (typeof value === 'string') {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date.toISOString().slice(0, 19).replace('T', ' ');
            }
        }

        // Handle Date objects
        if (value instanceof Date && !isNaN(value.getTime())) {
            return value.toISOString().slice(0, 19).replace('T', ' ');
        }
    }

    return value;
};

// Check if column name suggests it's a date
const isDateColumn = (columnName) => {
    if (!columnName) return false;
    const lower = columnName.toLowerCase();
    const datePatterns = ['date', 'tanggal', 'tgl', 'created', 'updated', 'time', 'waktu'];
    return datePatterns.some(p => lower.includes(p));
};

/**
 * Parse file and return rows
 */
async function parseFile(filePath, ext) {
    return new Promise((resolve, reject) => {
        try {
            if (ext === '.csv') {
                const rows = [];

                // Auto-detect delimiter by reading first line
                const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0];
                const commaCount = (firstLine.match(/,/g) || []).length;
                const semicolonCount = (firstLine.match(/;/g) || []).length;
                const delimiter = semicolonCount > commaCount ? ';' : ',';

                parentPort.postMessage({
                    type: 'log',
                    message: `CSV delimiter detected: "${delimiter}" (commas: ${commaCount}, semicolons: ${semicolonCount})`
                });

                fs.createReadStream(filePath)
                    .pipe(csv({
                        separator: delimiter,
                        mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') // Remove BOM and trim
                    }))
                    .on('data', (row) => rows.push(row))
                    .on('end', () => resolve(rows))
                    .on('error', reject);
            } else {
                // Excel file
                parentPort.postMessage({ type: 'log', message: 'Reading Excel file...' });

                const workbook = xlsx.readFile(filePath, {
                    type: 'file',
                    cellDates: true,
                    cellNF: false,
                    cellHTML: false,
                    dense: false,
                    raw: false
                });

                const firstSheet = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheet];

                parentPort.postMessage({ type: 'log', message: 'Converting to JSON...' });

                let rawRows = xlsx.utils.sheet_to_json(worksheet, {
                    defval: null,
                    raw: false,
                    dateNF: 'yyyy-mm-dd'
                });

                // Clean Excel keys (trim & remove BOM)
                const rows = rawRows.map(row => {
                    const cleanRow = {};
                    Object.keys(row).forEach(key => {
                        const cleanKey = key.trim().replace(/^\uFEFF/, '');
                        cleanRow[cleanKey] = row[key];
                    });
                    return cleanRow;
                });

                parentPort.postMessage({ type: 'log', message: `Parsed ${rows.length} rows` });
                resolve(rows);
            }
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Main worker execution
 */
async function main() {
    const { filePath, ext, taskId } = workerData;

    try {
        parentPort.postMessage({
            type: 'status',
            status: 'parsing',
            message: 'Starting file parsing...'
        });

        const rows = await parseFile(filePath, ext);

        parentPort.postMessage({
            type: 'result',
            success: true,
            rows: rows,
            totalRows: rows.length
        });

    } catch (error) {
        parentPort.postMessage({
            type: 'result',
            success: false,
            error: error.message
        });
    }
}

main();
