/**
 * Date Normalization Utility
 * Converts various date formats to MySQL standard: YYYY-MM-DD HH:mm:ss
 */

const MONTH_MAP = {
    'jan': '01', 'january': '01',
    'feb': '02', 'february': '02',
    'mar': '03', 'march': '03',
    'apr': '04', 'april': '04',
    'may': '05',
    'jun': '06', 'june': '06',
    'jul': '07', 'july': '07',
    'aug': '08', 'august': '08',
    'sep': '09', 'september': '09',
    'oct': '10', 'october': '10',
    'nov': '11', 'november': '11',
    'dec': '12', 'december': '12'
};

const formatToMysql = (value) => {
    if (!value || value === '' || value === null || value === undefined) {
        return null;
    }

    // Already in MySQL format
    if (/^\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2}:\d{2})?$/.test(value)) {
        return value.length === 10 ? `${value} 00:00:00` : value;
    }

    let day, month, year;
    const str = String(value).trim();

    // DD/MM/YYYY or DD-MM-YYYY
    const slashDash1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (slashDash1) {
        [, day, month, year] = slashDash1;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} 00:00:00`;
    }

    // YYYY/MM/DD or YYYY-MM-DD (with possible time)
    const isoFormat = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{2}:\d{2}:\d{2}))?$/);
    if (isoFormat) {
        [, year, month, day] = isoFormat;
        const time = isoFormat[4] || '00:00:00';
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${time}`;
    }

    // MM-DD-YYYY or MM/DD/YYYY (US format)
    const usFormat = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (usFormat) {
        // Assume DD/MM/YYYY for non-US locales, but this is already handled above
        [, month, day, year] = usFormat;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} 00:00:00`;
    }

    // DD-MMM-YY or DD-MMM-YYYY (e.g., 04-DEC-24 or 04-DEC-2024)
    const monthName = str.match(/^(\d{1,2})[\/\-]([a-zA-Z]{3,9})[\/\-](\d{2,4})$/);
    if (monthName) {
        day = monthName[1].padStart(2, '0');
        const monthStr = monthName[2].toLowerCase();
        month = MONTH_MAP[monthStr];
        year = monthName[3];

        if (year.length === 2) {
            year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
        }

        if (month) {
            return `${year}-${month}-${day} 00:00:00`;
        }
    }

    // MMM DD, YYYY (e.g., Dec 4, 2024)
    const monthFirst = str.match(/^([a-zA-Z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
    if (monthFirst) {
        const monthStr = monthFirst[1].toLowerCase();
        month = MONTH_MAP[monthStr];
        day = monthFirst[2].padStart(2, '0');
        year = monthFirst[3];

        if (month) {
            return `${year}-${month}-${day} 00:00:00`;
        }
    }

    // Excel serial date number
    if (/^\d+(\.\d+)?$/.test(str) && parseFloat(str) > 30000 && parseFloat(str) < 60000) {
        const excelDate = parseFloat(str);
        const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
        const y = jsDate.getFullYear();
        const m = String(jsDate.getMonth() + 1).padStart(2, '0');
        const d = String(jsDate.getDate()).padStart(2, '0');
        const h = String(jsDate.getHours()).padStart(2, '0');
        const min = String(jsDate.getMinutes()).padStart(2, '0');
        const s = String(jsDate.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
    }

    // Return original if no pattern matches
    return value;
};

const isDateColumn = (columnName) => {
    const dateKeywords = ['date', 'time', 'created', 'updated', 'modified', 'timestamp', 'tanggal', 'waktu'];
    const lowerName = columnName.toLowerCase();
    return dateKeywords.some(keyword => lowerName.includes(keyword));
};

module.exports = { formatToMysql, isDateColumn };
