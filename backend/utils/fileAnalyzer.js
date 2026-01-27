const xlsx = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');

const inferColumnType = (values) => {
    let hasNull = false;
    let allInt = true;
    let allFloat = true;
    let allDate = true;
    let maxLength = 0;

    for (const val of values) {
        if (val === null || val === undefined || val === '') {
            hasNull = true;
            continue;
        }

        const str = String(val).trim();
        maxLength = Math.max(maxLength, str.length);

        // Check integer
        if (!/^-?\d+$/.test(str)) {
            allInt = false;
        }

        // Check float
        if (!/^-?\d+(\.\d+)?$/.test(str)) {
            allFloat = false;
        }

        // Check date patterns
        const datePatterns = [
            /^\d{4}-\d{2}-\d{2}$/,
            /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
            /^\d{1,2}[\/\-][a-zA-Z]{3,9}[\/\-]\d{2,4}$/,
            /^[a-zA-Z]{3,9}\s+\d{1,2},?\s+\d{4}$/
        ];
        if (!datePatterns.some(p => p.test(str))) {
            allDate = false;
        }
    }

    if (allInt && !hasNull && maxLength <= 11) return 'INT';
    if (allFloat && !hasNull) return 'DECIMAL(15,2)';
    if (allDate) return 'DATETIME';
    if (maxLength <= 255) return `VARCHAR(${Math.max(50, Math.ceil(maxLength / 50) * 50)})`;
    return 'TEXT';
};

const analyzeExcel = (filePath) => {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { defval: null });

    if (data.length === 0) {
        return { columns: [], sampleData: [] };
    }

    const columnNames = Object.keys(data[0]);
    const sampleSize = Math.min(100, data.length);
    const columns = [];

    for (const colName of columnNames) {
        const values = data.slice(0, sampleSize).map(row => row[colName]);
        const suggestedType = inferColumnType(values);

        columns.push({
            name: colName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
            originalName: colName,
            type: suggestedType,
            nullable: true,
            primaryKey: false
        });
    }

    return {
        columns,
        sampleData: data.slice(0, 5),
        totalRows: data.length
    };
};

const analyzeCsv = (filePath) => {
    return new Promise((resolve, reject) => {
        const rows = [];
        let columnNames = [];

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('headers', (headers) => {
                columnNames = headers;
            })
            .on('data', (row) => {
                if (rows.length < 100) rows.push(row);
            })
            .on('end', () => {
                const columns = columnNames.map(colName => {
                    const values = rows.map(row => row[colName]);
                    const suggestedType = inferColumnType(values);

                    return {
                        name: colName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
                        originalName: colName,
                        type: suggestedType,
                        nullable: true,
                        primaryKey: false
                    };
                });

                resolve({
                    columns,
                    sampleData: rows.slice(0, 5),
                    totalRows: rows.length
                });
            })
            .on('error', reject);
    });
};

const analyzeFile = async (filePath, fileType) => {
    if (fileType === 'xlsx' || fileType === 'xls') {
        return analyzeExcel(filePath);
    } else if (fileType === 'csv') {
        return await analyzeCsv(filePath);
    }
    throw new Error('Unsupported file type');
};

module.exports = { analyzeFile, analyzeExcel, analyzeCsv, inferColumnType };
