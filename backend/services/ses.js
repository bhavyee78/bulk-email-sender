/**
 * AWS SES Service - Email Sending with Safety Guards
 * 
 * This module wraps AWS SES with multiple safety layers:
 * 1. Local daily quota tracking
 * 2. AWS SES quota checking
 * 3. Sandbox mode awareness
 * 4. Detailed error handling
 */

const { SESClient, SendEmailCommand, GetSendQuotaCommand } = require('@aws-sdk/client-ses');
const { v4: uuidv4 } = require('uuid');

// Initialize SES client with credentials from environment
const sesClient = new SESClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

/**
 * Get current SES sending quota from AWS
 * This tells us the actual AWS limits
 */
async function getSESQuota() {
    try {
        const command = new GetSendQuotaCommand({});
        const response = await sesClient.send(command);
        
        return {
            success: true,
            quota: {
                max24HourSend: response.Max24HourSend,
                sentLast24Hours: response.SentLast24Hours,
                maxSendRate: response.MaxSendRate,
                remaining: response.Max24HourSend - response.SentLast24Hours
            }
        };
    } catch (error) {
        console.error('Failed to get SES quota:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Check if SES has capacity for sending
 */
async function checkSESCapacity(requestedCount = 1) {
    const quotaResult = await getSESQuota();
    
    if (!quotaResult.success) {
        // If we can't check quota, be conservative and allow
        // Local quota will still protect us
        return {
            canSend: true,
            warning: 'Could not verify AWS quota. Local limits still apply.',
            quotaError: quotaResult.error
        };
    }
    
    const { quota } = quotaResult;
    const canSend = quota.remaining >= requestedCount;
    
    return {
        canSend,
        awsQuota: quota,
        message: canSend 
            ? `AWS SES has capacity: ${quota.remaining} emails remaining in 24h window`
            : `AWS SES quota exceeded: ${quota.sentLast24Hours}/${quota.max24HourSend} sent`
    };
}

/**
 * Replace personalization variables in text
 */
function personalizeContent(text, contact) {
    if (!text) return text;
    
    return text
        .replace(/\{first_name\}/gi, contact.first_name || '')
        .replace(/\{last_name\}/gi, contact.last_name || '')
        .replace(/\{company_name\}/gi, contact.company_name || '')
        .replace(/\{email\}/gi, contact.email || '');
}

/**
 * Generate tracking pixel HTML
 */
function generateTrackingPixel(trackingId) {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const trackingUrl = `${baseUrl}/api/track/open/${trackingId}`;
    
    return `<img src="${trackingUrl}" width="1" height="1" style="display:none;" alt="" />`;
}

/**
 * Send a single email via SES
 */
async function sendEmail(to, subject, htmlBody, textBody, trackingId) {
    const fromEmail = process.env.SES_FROM_EMAIL;
    
    if (!fromEmail) {
        throw new Error('SES_FROM_EMAIL not configured in environment');
    }
    
    // Add tracking pixel to HTML body
    const trackedHtmlBody = htmlBody + generateTrackingPixel(trackingId);
    
    const command = new SendEmailCommand({
        Source: fromEmail,
        Destination: {
            ToAddresses: [to]
        },
        Message: {
            Subject: {
                Data: subject,
                Charset: 'UTF-8'
            },
            Body: {
                Html: {
                    Data: trackedHtmlBody,
                    Charset: 'UTF-8'
                },
                Text: {
                    Data: textBody || subject, // Fallback to subject if no text body
                    Charset: 'UTF-8'
                }
            }
        }
    });
    
    try {
        const response = await sesClient.send(command);
        return {
            success: true,
            messageId: response.MessageId,
            trackingId
        };
    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error.message);
        
        // Provide helpful error messages
        let friendlyError = error.message;
        
        if (error.name === 'MessageRejected') {
            if (error.message.includes('not verified')) {
                friendlyError = `Email address ${to} is not verified. In SES sandbox mode, both sender AND recipient must be verified.`;
            }
        } else if (error.name === 'Throttling') {
            friendlyError = 'AWS SES is throttling requests. Please slow down or wait.';
        }
        
        return {
            success: false,
            error: friendlyError,
            originalError: error.name
        };
    }
}

/**
 * Send bulk emails with personalization
 * Returns detailed results for each email
 */
async function sendBulkEmails(contacts, subject, htmlBody, campaignId, db) {
    const results = {
        successful: [],
        failed: [],
        totalRequested: contacts.length
    };
    
    // Prepare statements for database operations
    const insertSentEmail = db.prepare(`
        INSERT INTO sent_emails (campaign_id, contact_id, tracking_id, subject, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    for (const contact of contacts) {
        const trackingId = uuidv4();
        
        // Personalize content for this contact
        const personalizedSubject = personalizeContent(subject, contact);
        const personalizedBody = personalizeContent(htmlBody, contact);
        const textBody = personalizedBody.replace(/<[^>]*>/g, ''); // Strip HTML for text version
        
        // Send the email
        const result = await sendEmail(
            contact.email,
            personalizedSubject,
            personalizedBody,
            textBody,
            trackingId
        );
        
        // Record in database
        insertSentEmail.run(
            campaignId,
            contact.id,
            trackingId,
            personalizedSubject,
            result.success ? 'sent' : 'failed',
            result.error || null
        );
        
        if (result.success) {
            results.successful.push({
                contact,
                messageId: result.messageId,
                trackingId: result.trackingId
            });
        } else {
            results.failed.push({
                contact,
                error: result.error
            });
        }
        
        // Small delay to avoid throttling (100ms between emails)
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
}

module.exports = {
    getSESQuota,
    checkSESCapacity,
    sendEmail,
    sendBulkEmails,
    personalizeContent,
    generateTrackingPixel
};
