/**
 * Email Routes
 * 
 * Handles all email operations:
 * - Send bulk emails with personalization
 * - Get send history
 * - Preview personalized content
 * 
 * PROTECTED BY QUOTA GUARD - Cannot exceed daily limits
 */

const express = require('express');
const { db, incrementDailyCount } = require('../config/database');
const { sendBulkEmails, personalizeContent, getSESQuota } = require('../services/ses');
const { getQuotaStatus, reserveQuota, validateSendRequest } = require('../services/quota');
const { quotaGuard } = require('../middleware/quotaGuard');

const router = express.Router();

/**
 * GET /api/emails/quota
 * Get current quota status
 */
router.get('/quota', async (req, res) => {
    try {
        const status = await getQuotaStatus();
        
        res.json({
            success: true,
            quota: status
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch quota status',
            details: error.message
        });
    }
});

/**
 * POST /api/emails/validate
 * Validate if we can send to selected contacts
 */
router.post('/validate', async (req, res) => {
    try {
        const { contactIds } = req.body;
        
        if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Please provide contact IDs to validate'
            });
        }
        
        const validation = await validateSendRequest(contactIds.length);
        
        res.json({
            success: true,
            canSend: validation.canSend,
            requestedCount: validation.requestedCount,
            availableCount: validation.availableCount,
            reasons: validation.reasons,
            warnings: validation.warnings,
            quotaDetails: validation.quotaDetails
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to validate send request',
            details: error.message
        });
    }
});

/**
 * POST /api/emails/preview
 * Preview personalized content for a contact
 */
router.post('/preview', (req, res) => {
    try {
        const { contactId, subject, body } = req.body;
        
        if (!contactId) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a contact ID for preview'
            });
        }
        
        const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
        
        if (!contact) {
            return res.status(404).json({
                success: false,
                error: 'Contact not found'
            });
        }
        
        const personalizedSubject = personalizeContent(subject || '', contact);
        const personalizedBody = personalizeContent(body || '', contact);
        
        res.json({
            success: true,
            preview: {
                contact,
                subject: personalizedSubject,
                body: personalizedBody
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to generate preview',
            details: error.message
        });
    }
});

/**
 * POST /api/emails/send
 * Send bulk emails - PROTECTED BY QUOTA GUARD
 */
router.post('/send', quotaGuard, async (req, res) => {
    try {
        const { contactIds, subject, body } = req.body;
        
        // Validate required fields
        if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Please select at least one contact'
            });
        }
        
        if (!subject || !subject.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Email subject is required'
            });
        }
        
        if (!body || !body.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Email body is required'
            });
        }
        
        // Get contacts from database
        const placeholders = contactIds.map(() => '?').join(',');
        const contacts = db.prepare(`SELECT * FROM contacts WHERE id IN (${placeholders})`).all(...contactIds);
        
        if (contacts.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No valid contacts found'
            });
        }
        
        // Reserve quota before sending
        // This prevents race conditions where multiple requests could exceed the limit
        try {
            reserveQuota(contacts.length);
        } catch (quotaError) {
            return res.status(429).json({
                success: false,
                error: 'QUOTA_RESERVATION_FAILED',
                message: quotaError.message
            });
        }
        
        // Create campaign record
        const campaignStmt = db.prepare('INSERT INTO campaigns (subject, body) VALUES (?, ?)');
        const campaignResult = campaignStmt.run(subject, body);
        const campaignId = campaignResult.lastInsertRowid;
        
        // Send emails
        const results = await sendBulkEmails(contacts, subject, body, campaignId, db);
        
        // Build response with any warnings from quota check
        const response = {
            success: true,
            message: `Email campaign completed`,
            campaignId,
            results: {
                totalRequested: results.totalRequested,
                successful: results.successful.length,
                failed: results.failed.length
            },
            successful: results.successful.map(r => ({
                email: r.contact.email,
                name: `${r.contact.first_name} ${r.contact.last_name}`,
                messageId: r.messageId
            })),
            failed: results.failed.map(r => ({
                email: r.contact.email,
                name: `${r.contact.first_name} ${r.contact.last_name}`,
                error: r.error
            }))
        };
        
        // Add quota warnings if any
        if (req.quotaWarnings && req.quotaWarnings.length > 0) {
            response.warnings = req.quotaWarnings;
        }
        
        res.json(response);
        
    } catch (error) {
        console.error('Error sending emails:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send emails',
            details: error.message
        });
    }
});

/**
 * GET /api/emails/history
 * Get send history with tracking data
 */
router.get('/history', (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        
        // Get sent emails with contact info and open counts
        const query = `
            SELECT 
                se.id,
                se.tracking_id,
                se.subject,
                se.sent_at,
                se.status,
                se.error_message,
                c.first_name,
                c.last_name,
                c.email,
                c.company_name,
                COUNT(eo.id) as open_count,
                MAX(eo.opened_at) as last_opened
            FROM sent_emails se
            JOIN contacts c ON se.contact_id = c.id
            LEFT JOIN email_opens eo ON se.id = eo.sent_email_id
            GROUP BY se.id
            ORDER BY se.sent_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const emails = db.prepare(query).all(limit, offset);
        
        // Get total count
        const { total } = db.prepare('SELECT COUNT(*) as total FROM sent_emails').get();
        
        // Calculate overall stats - count emails with at least 1 open
        const stats = db.prepare(`
            SELECT
                COUNT(DISTINCT se.id) as total_sent,
                COUNT(DISTINCT CASE WHEN eo.id IS NOT NULL THEN se.id END) as unique_opens
            FROM sent_emails se
            LEFT JOIN email_opens eo ON se.id = eo.sent_email_id
        `).get();

        res.json({
            success: true,
            emails: emails.map(e => ({
                id: e.id,
                trackingId: e.tracking_id,
                subject: e.subject,
                sentAt: e.sent_at,
                status: e.status,
                errorMessage: e.error_message,
                contact: {
                    firstName: e.first_name,
                    lastName: e.last_name,
                    email: e.email,
                    companyName: e.company_name
                },
                tracking: {
                    openCount: e.open_count,
                    lastOpened: e.last_opened
                }
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            stats: {
                totalSent: stats.total_sent,
                uniqueOpens: stats.unique_opens,
                openRate: stats.total_sent > 0
                    ? ((stats.unique_opens / stats.total_sent) * 100).toFixed(2) + '%'
                    : '0%'
            }
        });
        
    } catch (error) {
        console.error('Error fetching email history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch email history',
            details: error.message
        });
    }
});

/**
 * GET /api/emails/campaigns
 * List all campaigns
 */
router.get('/campaigns', (req, res) => {
    try {
        const campaigns = db.prepare(`
            SELECT 
                ca.id,
                ca.subject,
                ca.created_at,
                COUNT(se.id) as emails_sent,
                COUNT(DISTINCT CASE WHEN eo.id IS NOT NULL THEN se.id END) as unique_opens
            FROM campaigns ca
            LEFT JOIN sent_emails se ON ca.id = se.campaign_id
            LEFT JOIN email_opens eo ON se.id = eo.sent_email_id
            GROUP BY ca.id
            ORDER BY ca.created_at DESC
        `).all();
        
        res.json({
            success: true,
            campaigns: campaigns.map(c => ({
                ...c,
                openRate: c.emails_sent > 0 
                    ? ((c.unique_opens / c.emails_sent) * 100).toFixed(2) + '%'
                    : '0%'
            }))
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch campaigns',
            details: error.message
        });
    }
});

/**
 * GET /api/emails/export
 * Export tracking data as CSV
 */
router.get('/export', (req, res) => {
    try {
        const emails = db.prepare(`
            SELECT 
                c.first_name,
                c.last_name,
                c.email,
                c.company_name,
                se.subject,
                se.sent_at,
                se.status,
                COUNT(eo.id) as open_count,
                MAX(eo.opened_at) as last_opened
            FROM sent_emails se
            JOIN contacts c ON se.contact_id = c.id
            LEFT JOIN email_opens eo ON se.id = eo.sent_email_id
            GROUP BY se.id
            ORDER BY se.sent_at DESC
        `).all();
        
        // Generate CSV
        const headers = ['First Name', 'Last Name', 'Email', 'Company', 'Subject', 'Sent At', 'Status', 'Open Count', 'Last Opened'];
        const rows = emails.map(e => [
            e.first_name,
            e.last_name,
            e.email,
            e.company_name,
            e.subject,
            e.sent_at,
            e.status,
            e.open_count,
            e.last_opened || ''
        ]);
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="email_tracking_export.csv"');
        res.send(csvContent);
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to export data',
            details: error.message
        });
    }
});

module.exports = router;
