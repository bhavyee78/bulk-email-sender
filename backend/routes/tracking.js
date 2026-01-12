/**
 * Tracking Routes
 * 
 * Handles email open tracking via pixel:
 * - Serves 1x1 transparent GIF
 * - Records open events
 * - Provides tracking analytics
 * 
 * This endpoint is called when recipients open emails
 * and their email client loads the tracking pixel image.
 */

const express = require('express');
const { db } = require('../config/database');

const router = express.Router();

// 1x1 transparent GIF in base64
const TRACKING_PIXEL = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
);

/**
 * GET /api/track/open/:trackingId
 * Record email open and return tracking pixel
 *
 * This endpoint is embedded as an image in every email.
 * When the recipient opens the email and images are loaded,
 * this endpoint is called, allowing us to track opens.
 */
router.get('/open/:trackingId', (req, res) => {
    const { trackingId } = req.params;

    // Always return the pixel first (user experience priority)
    res.set({
        'Content-Type': 'image/gif',
        'Content-Length': TRACKING_PIXEL.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });

    // Record the open asynchronously (don't block response)
    setImmediate(() => {
        try {
            // Find the sent email
            const sentEmail = db.prepare(
                'SELECT id FROM sent_emails WHERE tracking_id = ?'
            ).get(trackingId);

            if (sentEmail) {
                const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
                const userAgent = req.get('User-Agent') || 'unknown';

                // Check if this is a duplicate within 5 minutes (prevent email client pre-fetches/auto-reloads)
                const recentOpen = db.prepare(`
                    SELECT id FROM email_opens
                    WHERE sent_email_id = ?
                    AND ip_address = ?
                    AND opened_at > datetime('now', '-5 minutes')
                `).get(sentEmail.id, ipAddress);

                if (!recentOpen) {
                    // Record the open
                    const insertOpen = db.prepare(`
                        INSERT INTO email_opens (sent_email_id, tracking_id, ip_address, user_agent)
                        VALUES (?, ?, ?, ?)
                    `);

                    insertOpen.run(
                        sentEmail.id,
                        trackingId,
                        ipAddress,
                        userAgent
                    );

                    console.log(`📬 Email opened: ${trackingId}`);
                }
            }
        } catch (error) {
            // Don't let tracking errors affect the response
            console.error('Error recording email open:', error.message);
        }
    });

    res.send(TRACKING_PIXEL);
});

/**
 * GET /api/track/stats/:trackingId
 * Get tracking stats for a specific email
 */
router.get('/stats/:trackingId', (req, res) => {
    try {
        const { trackingId } = req.params;
        
        const sentEmail = db.prepare(`
            SELECT 
                se.id,
                se.tracking_id,
                se.subject,
                se.sent_at,
                se.status,
                c.first_name,
                c.last_name,
                c.email,
                c.company_name
            FROM sent_emails se
            JOIN contacts c ON se.contact_id = c.id
            WHERE se.tracking_id = ?
        `).get(trackingId);
        
        if (!sentEmail) {
            return res.status(404).json({
                success: false,
                error: 'Email not found'
            });
        }
        
        const opens = db.prepare(`
            SELECT opened_at, ip_address, user_agent
            FROM email_opens
            WHERE tracking_id = ?
            ORDER BY opened_at DESC
        `).all(trackingId);
        
        res.json({
            success: true,
            email: {
                id: sentEmail.id,
                trackingId: sentEmail.tracking_id,
                subject: sentEmail.subject,
                sentAt: sentEmail.sent_at,
                status: sentEmail.status,
                recipient: {
                    name: `${sentEmail.first_name} ${sentEmail.last_name}`,
                    email: sentEmail.email,
                    company: sentEmail.company_name
                }
            },
            tracking: {
                totalOpens: opens.length,
                uniqueOpens: opens.length > 0 ? 1 : 0, // Each tracking ID is for one recipient
                firstOpened: opens.length > 0 ? opens[opens.length - 1].opened_at : null,
                lastOpened: opens.length > 0 ? opens[0].opened_at : null,
                opens: opens.map(o => ({
                    openedAt: o.opened_at,
                    ipAddress: o.ip_address,
                    userAgent: o.user_agent
                }))
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tracking stats',
            details: error.message
        });
    }
});

/**
 * GET /api/track/summary
 * Get overall tracking summary
 */
router.get('/summary', (req, res) => {
    try {
        // Overall stats
        const overall = db.prepare(`
            SELECT 
                COUNT(DISTINCT se.id) as total_sent,
                COUNT(DISTINCT CASE WHEN eo.id IS NOT NULL THEN se.id END) as emails_opened,
                COUNT(eo.id) as total_opens
            FROM sent_emails se
            LEFT JOIN email_opens eo ON se.id = eo.sent_email_id
        `).get();
        
        // Daily stats for the last 7 days
        const dailyStats = db.prepare(`
            SELECT 
                DATE(se.sent_at) as date,
                COUNT(DISTINCT se.id) as sent,
                COUNT(DISTINCT CASE WHEN eo.id IS NOT NULL THEN se.id END) as opened
            FROM sent_emails se
            LEFT JOIN email_opens eo ON se.id = eo.sent_email_id
            WHERE se.sent_at >= DATE('now', '-7 days')
            GROUP BY DATE(se.sent_at)
            ORDER BY date DESC
        `).all();
        
        // Top performing emails
        const topEmails = db.prepare(`
            SELECT 
                se.subject,
                COUNT(eo.id) as open_count,
                se.sent_at
            FROM sent_emails se
            LEFT JOIN email_opens eo ON se.id = eo.sent_email_id
            GROUP BY se.id
            ORDER BY open_count DESC
            LIMIT 5
        `).all();
        
        res.json({
            success: true,
            summary: {
                overall: {
                    totalSent: overall.total_sent,
                    emailsOpened: overall.emails_opened,
                    totalOpens: overall.total_opens,
                    openRate: overall.total_sent > 0 
                        ? ((overall.emails_opened / overall.total_sent) * 100).toFixed(2) + '%'
                        : '0%'
                },
                dailyStats,
                topPerforming: topEmails
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tracking summary',
            details: error.message
        });
    }
});

module.exports = router;
