/**
 * Quota Management Service
 * 
 * Handles all quota-related operations to ensure we never exceed limits:
 * 1. Local daily quota tracking (our primary safety guard)
 * 2. AWS SES quota checking (secondary verification)
 * 3. Clear logging and user feedback
 */

const { db, getDailyEmailCount, incrementDailyCount, canSendEmails, getTodayDate } = require('../config/database');
const { checkSESCapacity } = require('./ses');

/**
 * Get comprehensive quota status
 * Combines local tracking with AWS quota
 */
async function getQuotaStatus() {
    const dailyLimit = parseInt(process.env.DAILY_EMAIL_LIMIT) || 250;
    const localCount = getDailyEmailCount();
    const localRemaining = dailyLimit - localCount;
    
    // Get AWS quota
    const sesCapacity = await checkSESCapacity();
    
    return {
        local: {
            limit: dailyLimit,
            used: localCount,
            remaining: localRemaining,
            date: getTodayDate(),
            resetsAt: 'Midnight UTC'
        },
        aws: sesCapacity.awsQuota || null,
        awsWarning: sesCapacity.warning || null,
        canSend: localRemaining > 0 && sesCapacity.canSend,
        effectiveRemaining: Math.min(
            localRemaining,
            sesCapacity.awsQuota?.remaining || localRemaining
        )
    };
}

/**
 * Validate if we can send a specific number of emails
 * Returns detailed information about the decision
 */
async function validateSendRequest(requestedCount) {
    const dailyLimit = parseInt(process.env.DAILY_EMAIL_LIMIT) || 250;
    const localQuota = canSendEmails(requestedCount);
    const sesCapacity = await checkSESCapacity(requestedCount);
    
    const reasons = [];
    let canSend = true;
    
    // Check local quota first
    if (!localQuota.canSend) {
        canSend = false;
        reasons.push({
            type: 'LOCAL_QUOTA_EXCEEDED',
            message: `Daily limit reached. You've sent ${localQuota.currentCount}/${localQuota.limit} emails today.`,
            detail: `Requested: ${requestedCount}, Available: ${localQuota.remaining}`
        });
    }
    
    // Check AWS quota
    if (!sesCapacity.canSend) {
        canSend = false;
        reasons.push({
            type: 'AWS_QUOTA_EXCEEDED',
            message: sesCapacity.message,
            detail: sesCapacity.awsQuota 
                ? `AWS limit: ${sesCapacity.awsQuota.max24HourSend}, Sent: ${sesCapacity.awsQuota.sentLast24Hours}`
                : 'Could not retrieve AWS quota'
        });
    }
    
    // Warnings that don't block sending
    const warnings = [];
    if (sesCapacity.warning) {
        warnings.push(sesCapacity.warning);
    }
    
    if (localQuota.remaining < 50 && localQuota.remaining > requestedCount) {
        warnings.push(`Low quota warning: Only ${localQuota.remaining} emails remaining today.`);
    }
    
    return {
        canSend,
        requestedCount,
        availableCount: Math.min(localQuota.remaining, sesCapacity.awsQuota?.remaining || localQuota.remaining),
        reasons,
        warnings,
        quotaDetails: {
            local: {
                limit: dailyLimit,
                used: localQuota.currentCount,
                remaining: localQuota.remaining
            },
            aws: sesCapacity.awsQuota || null
        }
    };
}

/**
 * Reserve quota for sending
 * Should be called BEFORE sending emails
 */
function reserveQuota(count) {
    const validation = canSendEmails(count);
    
    if (!validation.canSend) {
        throw new Error(`Cannot reserve quota: ${count} requested but only ${validation.remaining} available`);
    }
    
    incrementDailyCount(count);
    
    console.log(`📧 Quota reserved: ${count} emails. Today's total: ${validation.currentCount + count}/${validation.limit}`);
    
    return {
        reserved: count,
        newTotal: validation.currentCount + count,
        remaining: validation.remaining - count
    };
}

/**
 * Get quota history for the past N days
 */
function getQuotaHistory(days = 7) {
    const stmt = db.prepare(`
        SELECT date, emails_sent, last_updated
        FROM daily_quota
        ORDER BY date DESC
        LIMIT ?
    `);
    
    return stmt.all(days);
}

/**
 * Log quota event for debugging
 */
function logQuotaEvent(event, details) {
    const timestamp = new Date().toISOString();
    console.log(`[QUOTA ${timestamp}] ${event}:`, JSON.stringify(details, null, 2));
}

module.exports = {
    getQuotaStatus,
    validateSendRequest,
    reserveQuota,
    getQuotaHistory,
    logQuotaEvent
};
