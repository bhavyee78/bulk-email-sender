/**
 * Quota Guard Middleware
 * 
 * Express middleware that blocks email sending requests
 * when quota is exceeded. This is a HARD GUARD that cannot
 * be bypassed - essential for zero billing risk.
 */

const { validateSendRequest, logQuotaEvent } = require('../services/quota');

/**
 * Middleware to check quota before processing email send requests
 * Use on routes that send emails
 */
async function quotaGuard(req, res, next) {
    // Get the number of emails being requested
    // This should be set by the route or determined from request body
    const requestedCount = req.body.contacts?.length || req.body.contactIds?.length || 1;
    
    try {
        const validation = await validateSendRequest(requestedCount);
        
        // Log the quota check
        logQuotaEvent('QUOTA_CHECK', {
            requested: requestedCount,
            canSend: validation.canSend,
            available: validation.availableCount,
            ip: req.ip
        });
        
        if (!validation.canSend) {
            // BLOCK THE REQUEST
            logQuotaEvent('QUOTA_BLOCKED', {
                requested: requestedCount,
                reasons: validation.reasons
            });
            
            return res.status(429).json({
                success: false,
                error: 'QUOTA_EXCEEDED',
                message: 'Cannot send emails - quota exceeded',
                details: {
                    reasons: validation.reasons,
                    quotaStatus: validation.quotaDetails,
                    suggestion: 'Please wait until tomorrow (midnight UTC) when your quota resets.'
                }
            });
        }
        
        // Attach validation info to request for use in route handler
        req.quotaValidation = validation;
        
        // Add any warnings to response
        if (validation.warnings.length > 0) {
            req.quotaWarnings = validation.warnings;
        }
        
        next();
        
    } catch (error) {
        logQuotaEvent('QUOTA_ERROR', { error: error.message });
        
        // On error, be conservative and block
        return res.status(500).json({
            success: false,
            error: 'QUOTA_CHECK_FAILED',
            message: 'Failed to verify quota. Blocking send as a safety measure.',
            details: error.message
        });
    }
}

/**
 * Rate limiting middleware for general API protection
 * Simple in-memory rate limiting (reset on server restart)
 */
const requestCounts = new Map();

function rateLimiter(windowMs = 60000, maxRequests = 100) {
    return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        
        // Clean up old entries
        for (const [k, v] of requestCounts.entries()) {
            if (now - v.startTime > windowMs) {
                requestCounts.delete(k);
            }
        }
        
        // Get or create entry for this IP
        let entry = requestCounts.get(key);
        if (!entry || now - entry.startTime > windowMs) {
            entry = { count: 0, startTime: now };
            requestCounts.set(key, entry);
        }
        
        entry.count++;
        
        if (entry.count > maxRequests) {
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMITED',
                message: 'Too many requests. Please slow down.',
                retryAfter: Math.ceil((entry.startTime + windowMs - now) / 1000)
            });
        }
        
        next();
    };
}

module.exports = {
    quotaGuard,
    rateLimiter
};
