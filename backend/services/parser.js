/**
 * File Parser Service - Excel and CSV Support
 *
 * Handles parsing of uploaded files:
 * - Excel (.xlsx, .xls)
 * - CSV (.csv)
 *
 * Expected columns:
 * - first_name (required)
 * - last_name (optional)
 * - email (required)
 * - company_name (optional)
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Column name mappings (flexible matching)
const COLUMN_MAPPINGS = {
    first_name: ['first_name', 'firstname', 'first name', 'fname', 'given name', 'given_name'],
    last_name: ['last_name', 'lastname', 'last name', 'lname', 'surname', 'family name', 'family_name'],
    email: ['email', 'email address', 'email_address', 'e-mail', 'mail'],
    company_name: ['company_name', 'company', 'organization', 'organisation', 'org', 'company name', 'employer']
};

/**
 * Find the matching column name in the header row
 */
function findColumn(headers, targetField) {
    const possibleNames = COLUMN_MAPPINGS[targetField];
    
    for (const header of headers) {
        const normalizedHeader = header.toLowerCase().trim();
        if (possibleNames.includes(normalizedHeader)) {
            return header; // Return original header name
        }
    }
    
    return null;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}

/**
 * Clean and validate a contact row
 */
function cleanContact(row, columnMap) {
    const contact = {
        first_name: row[columnMap.first_name]?.toString().trim() || '',
        last_name: row[columnMap.last_name]?.toString().trim() || '',
        email: row[columnMap.email]?.toString().trim().toLowerCase() || '',
        company_name: row[columnMap.company_name]?.toString().trim() || ''
    };
    
    // Validation
    const errors = [];

    if (!contact.first_name) {
        errors.push('Missing first name');
    }

    // Last name is optional - some contacts may not have a last name
    // if (!contact.last_name) {
    //     errors.push('Missing last name');
    // }

    if (!contact.email) {
        errors.push('Missing email');
    } else if (!isValidEmail(contact.email)) {
        errors.push('Invalid email format');
    }
    
    return {
        contact,
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Parse Excel file (.xlsx, .xls)
 */
function parseExcel(filePath) {
    try {
        const workbook = XLSX.readFile(filePath);
        
        // Get the first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert to JSON (first row as headers)
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        
        if (data.length === 0) {
            return {
                success: false,
                error: 'Excel file is empty or has no data rows'
            };
        }
        
        return processData(data);
        
    } catch (error) {
        return {
            success: false,
            error: `Failed to parse Excel file: ${error.message}`
        };
    }
}

/**
 * Parse CSV file
 */
function parseCSV(filePath) {
    try {
        const workbook = XLSX.readFile(filePath, { type: 'file' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        
        if (data.length === 0) {
            return {
                success: false,
                error: 'CSV file is empty or has no data rows'
            };
        }
        
        return processData(data);
        
    } catch (error) {
        return {
            success: false,
            error: `Failed to parse CSV file: ${error.message}`
        };
    }
}

/**
 * Process parsed data (common for both Excel and CSV)
 */
function processData(data) {
    // Get headers from first row
    const headers = Object.keys(data[0]);
    
    // Map columns to our expected fields
    const columnMap = {
        first_name: findColumn(headers, 'first_name'),
        last_name: findColumn(headers, 'last_name'),
        email: findColumn(headers, 'email'),
        company_name: findColumn(headers, 'company_name')
    };
    
    // Check required columns
    const missingColumns = [];
    if (!columnMap.first_name) missingColumns.push('first_name');
    // last_name column is now optional
    // if (!columnMap.last_name) missingColumns.push('last_name');
    if (!columnMap.email) missingColumns.push('email');

    if (missingColumns.length > 0) {
        return {
            success: false,
            error: `Missing required columns: ${missingColumns.join(', ')}. Found columns: ${headers.join(', ')}`
        };
    }
    
    // Process each row
    const contacts = [];
    const errors = [];
    
    data.forEach((row, index) => {
        const result = cleanContact(row, columnMap);
        
        if (result.isValid) {
            contacts.push(result.contact);
        } else {
            errors.push({
                row: index + 2, // +2 because index is 0-based and we skip header row
                errors: result.errors,
                data: result.contact
            });
        }
    });
    
    return {
        success: true,
        contacts,
        totalRows: data.length,
        validRows: contacts.length,
        invalidRows: errors.length,
        errors: errors.length > 0 ? errors : null,
        columnMapping: columnMap
    };
}

/**
 * Main parse function - auto-detects file type
 */
function parseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    if (!fs.existsSync(filePath)) {
        return {
            success: false,
            error: 'File not found'
        };
    }
    
    switch (ext) {
        case '.xlsx':
        case '.xls':
            return parseExcel(filePath);
        case '.csv':
            return parseCSV(filePath);
        default:
            return {
                success: false,
                error: `Unsupported file type: ${ext}. Please upload .xlsx, .xls, or .csv files.`
            };
    }
}

/**
 * Generate sample file content for download
 */
function generateSampleFile(format = 'xlsx') {
    const sampleData = [
        { first_name: 'John', last_name: 'Doe', email: 'john.doe@example.com', company_name: 'Acme Corp' },
        { first_name: 'Jane', last_name: 'Smith', email: 'jane.smith@example.com', company_name: 'Tech Inc' },
        { first_name: 'Bob', last_name: 'Johnson', email: 'bob.johnson@example.com', company_name: 'StartupXYZ' }
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');
    
    if (format === 'csv') {
        return XLSX.utils.sheet_to_csv(worksheet);
    }
    
    return XLSX.write(workbook, { type: 'buffer', bookType: format });
}

module.exports = {
    parseFile,
    parseExcel,
    parseCSV,
    generateSampleFile,
    isValidEmail
};
