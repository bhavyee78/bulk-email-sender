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

// Helper functions to parse user agent
function parseDeviceType(userAgent) {
    if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
        return 'Mobile';
    } else if (/tablet|ipad/i.test(userAgent)) {
        return 'Tablet';
    }
    return 'Desktop';
}

function parseEmailClient(userAgent) {
    if (/Gmail/i.test(userAgent)) return 'Gmail';
    if (/Outlook/i.test(userAgent)) return 'Outlook';
    if (/Apple Mail|Mail\/|AppleWebKit/i.test(userAgent)) return 'Apple Mail';
    if (/Thunderbird/i.test(userAgent)) return 'Thunderbird';
    if (/Yahoo/i.test(userAgent)) return 'Yahoo Mail';
    if (/ProtonMail/i.test(userAgent)) return 'ProtonMail';
    return 'Unknown';
}

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
                'SELECT id, sent_at FROM sent_emails WHERE tracking_id = ?'
            ).get(trackingId);

            if (sentEmail) {
                // Ignore opens within first 3 minutes after sending (email client pre-scans)
                const sentTime = new Date(sentEmail.sent_at).getTime();
                const now = Date.now();
                const minutesSinceSent = (now - sentTime) / 1000 / 60;

                if (minutesSinceSent < 3) {
                    console.log(`🚫 Ignoring pre-scan open for: ${trackingId} (${minutesSinceSent.toFixed(1)}min after send)`);
                    res.send(TRACKING_PIXEL);
                    return;
                }

                const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
                const userAgent = req.get('User-Agent') || 'unknown';

                // Parse device and email client from user agent
                const deviceType = parseDeviceType(userAgent);
                const emailClient = parseEmailClient(userAgent);

                // Check if duplicate within 5 minutes
                const recentOpen = db.prepare(`
                    SELECT id FROM email_opens
                    WHERE sent_email_id = ?
                    AND ip_address = ?
                    AND opened_at > datetime('now', '-5 minutes')
                `).get(sentEmail.id, ipAddress);

                if (!recentOpen) {
                    // Record the open
                    const insertOpen = db.prepare(`
                        INSERT INTO email_opens (sent_email_id, tracking_id, ip_address, user_agent, device_type, email_client)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `);

                    insertOpen.run(
                        sentEmail.id,
                        trackingId,
                        ipAddress,
                        userAgent,
                        deviceType,
                        emailClient
                    );

                    console.log(`📬 Email opened: ${trackingId} (${deviceType} - ${emailClient})`);
                }
            }
        } catch (error) {
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
            SELECT opened_at, ip_address, user_agent, device_type, email_client, country, city
            FROM email_opens
            WHERE tracking_id = ?
            ORDER BY opened_at DESC
        `).all(trackingId);

        // Calculate time to first open
        let timeToOpen = null;
        if (opens.length > 0) {
            const sentTime = new Date(sentEmail.sent_at).getTime();
            const firstOpenTime = new Date(opens[opens.length - 1].opened_at).getTime();
            const minutesToOpen = Math.round((firstOpenTime - sentTime) / 1000 / 60);
            timeToOpen = minutesToOpen;
        }

        // Device breakdown
        const deviceBreakdown = opens.reduce((acc, o) => {
            acc[o.device_type] = (acc[o.device_type] || 0) + 1;
            return acc;
        }, {});

        // Email client breakdown
        const clientBreakdown = opens.reduce((acc, o) => {
            acc[o.email_client] = (acc[o.email_client] || 0) + 1;
            return acc;
        }, {});

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
                uniqueOpens: opens.length > 0 ? 1 : 0,
                firstOpened: opens.length > 0 ? opens[opens.length - 1].opened_at : null,
                lastOpened: opens.length > 0 ? opens[0].opened_at : null,
                timeToOpen: timeToOpen,
                deviceBreakdown: deviceBreakdown,
                clientBreakdown: clientBreakdown,
                opens: opens.map(o => ({
                    openedAt: o.opened_at,
                    ipAddress: o.ip_address,
                    userAgent: o.user_agent,
                    deviceType: o.device_type,
                    emailClient: o.email_client,
                    country: o.country,
                    city: o.city
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
 * Get overall tracking summary with analytics
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

        // Device breakdown
        const deviceStats = db.prepare(`
            SELECT device_type, COUNT(*) as count
            FROM email_opens
            GROUP BY device_type
            ORDER BY count DESC
        `).all();

        // Email client breakdown
        const clientStats = db.prepare(`
            SELECT email_client, COUNT(*) as count
            FROM email_opens
            GROUP BY email_client
            ORDER BY count DESC
        `).all();

        // Average time to open
        const avgTimeToOpen = db.prepare(`
            SELECT AVG(
                (strftime('%s', eo.opened_at) - strftime('%s', se.sent_at)) / 60
            ) as avg_minutes
            FROM sent_emails se
            JOIN email_opens eo ON se.id = eo.sent_email_id
            WHERE eo.id IN (
                SELECT MIN(id) FROM email_opens GROUP BY sent_email_id
            )
        `).get();

        // Best open times (hour of day)
        const openTimes = db.prepare(`
            SELECT strftime('%H', opened_at) as hour, COUNT(*) as count
            FROM email_opens
            GROUP BY hour
            ORDER BY count DESC
            LIMIT 5
        `).all();

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
                        : '0%',
                    avgTimeToOpen: avgTimeToOpen.avg_minutes ? Math.round(avgTimeToOpen.avg_minutes) : null
                },
                deviceBreakdown: deviceStats,
                clientBreakdown: clientStats,
                bestOpenTimes: openTimes,
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
