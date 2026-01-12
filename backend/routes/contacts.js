/**
 * Contacts Routes
 * 
 * Handles all contact management operations:
 * - Upload (Excel/CSV)
 * - List
 * - Get single
 * - Delete
 * - Bulk delete
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../config/database');
const { parseFile, generateSampleFile } = require('../services/parser');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.xlsx', '.xls', '.csv'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Please upload .xlsx, .xls, or .csv files.'));
        }
    }
});

/**
 * GET /api/contacts
 * List all contacts with pagination
 */
router.get('/', (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        
        let query = 'SELECT * FROM contacts';
        let countQuery = 'SELECT COUNT(*) as total FROM contacts';
        let params = [];
        
        if (search) {
            const searchClause = ` WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR company_name LIKE ?`;
            query += searchClause;
            countQuery += searchClause;
            const searchParam = `%${search}%`;
            params = [searchParam, searchParam, searchParam, searchParam];
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        
        const contacts = db.prepare(query).all([...params, limit, offset]);
        const { total } = db.prepare(countQuery).get(params);
        
        res.json({
            success: true,
            contacts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch contacts',
            details: error.message
        });
    }
});

/**
 * GET /api/contacts/:id
 * Get single contact
 */
router.get('/:id', (req, res) => {
    try {
        const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
        
        if (!contact) {
            return res.status(404).json({
                success: false,
                error: 'Contact not found'
            });
        }
        
        res.json({
            success: true,
            contact
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch contact',
            details: error.message
        });
    }
});

/**
 * POST /api/contacts/upload
 * Upload contacts from Excel/CSV file
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'No file uploaded'
        });
    }
    
    try {
        // Parse the uploaded file
        const result = parseFile(req.file.path);
        
        if (!result.success) {
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }
        
        // Insert contacts into database
        const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO contacts (first_name, last_name, email, company_name)
            VALUES (?, ?, ?, ?)
        `);
        
        const insertMany = db.transaction((contacts) => {
            let inserted = 0;
            let skipped = 0;
            
            for (const contact of contacts) {
                const info = insertStmt.run(
                    contact.first_name,
                    contact.last_name,
                    contact.email,
                    contact.company_name
                );
                
                if (info.changes > 0) {
                    inserted++;
                } else {
                    skipped++;
                }
            }
            
            return { inserted, skipped };
        });
        
        const dbResult = insertMany(result.contacts);
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        res.json({
            success: true,
            message: 'Contacts imported successfully',
            stats: {
                totalRows: result.totalRows,
                validRows: result.validRows,
                invalidRows: result.invalidRows,
                inserted: dbResult.inserted,
                skipped: dbResult.skipped,
                skippedReason: dbResult.skipped > 0 ? 'Duplicate emails' : null
            },
            errors: result.errors
        });
        
    } catch (error) {
        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        console.error('Error uploading contacts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process uploaded file',
            details: error.message
        });
    }
});

/**
 * POST /api/contacts
 * Add single contact manually
 */
router.post('/', (req, res) => {
    try {
        const { first_name, last_name, email, company_name } = req.body;
        
        // Validation
        if (!first_name || !last_name || !email) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: first_name, last_name, email'
            });
        }
        
        const stmt = db.prepare(`
            INSERT INTO contacts (first_name, last_name, email, company_name)
            VALUES (?, ?, ?, ?)
        `);
        
        const info = stmt.run(first_name, last_name, email.toLowerCase(), company_name || '');
        
        res.json({
            success: true,
            message: 'Contact added successfully',
            contactId: info.lastInsertRowid
        });
        
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({
                success: false,
                error: 'A contact with this email already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to add contact',
            details: error.message
        });
    }
});

/**
 * DELETE /api/contacts/:id
 * Delete single contact
 */
router.delete('/:id', (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM contacts WHERE id = ?');
        const info = stmt.run(req.params.id);
        
        if (info.changes === 0) {
            return res.status(404).json({
                success: false,
                error: 'Contact not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Contact deleted successfully'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to delete contact',
            details: error.message
        });
    }
});

/**
 * DELETE /api/contacts
 * Bulk delete contacts
 */
router.delete('/', (req, res) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Please provide an array of contact IDs to delete'
            });
        }
        
        const placeholders = ids.map(() => '?').join(',');
        const stmt = db.prepare(`DELETE FROM contacts WHERE id IN (${placeholders})`);
        const info = stmt.run(...ids);
        
        res.json({
            success: true,
            message: `Deleted ${info.changes} contacts`,
            deletedCount: info.changes
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to delete contacts',
            details: error.message
        });
    }
});

/**
 * GET /api/contacts/sample/:format
 * Download sample file template
 */
router.get('/sample/:format', (req, res) => {
    try {
        const format = req.params.format.toLowerCase();
        
        if (!['xlsx', 'csv'].includes(format)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid format. Use xlsx or csv.'
            });
        }
        
        const buffer = generateSampleFile(format);
        const filename = `sample_contacts.${format}`;
        const contentType = format === 'xlsx' 
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv';
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', contentType);
        res.send(buffer);
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to generate sample file',
            details: error.message
        });
    }
});

module.exports = router;
