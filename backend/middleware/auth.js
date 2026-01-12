/**
 * Authentication Middleware
 *
 * Provides secure authentication:
 * - Session-based authentication
 * - Password hashing with bcrypt
 * - Rate limiting for login attempts
 * - Secure session management
 */

const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

// Credentials (hashed password stored)
const USERS = {
    'rohanfiladil': {
        username: 'rohanfiladil',
        // Password: rohanfiladil@2828 (hashed with bcrypt)
        passwordHash: '$2b$10$hGbwQGgDHlDy5567IoWUiOxvfvuxCsLD9PP5.iCYFSLK9DJ4Ed2jm'
    }
};

// Generate hash for new passwords (for reference)
async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

/**
 * Login Rate Limiter - Prevent brute force attacks
 * Max 5 attempts per 15 minutes
 */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per windowMs
    message: {
        success: false,
        error: 'Too many login attempts. Please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true // Don't count successful logins
});

/**
 * Verify user credentials
 */
async function verifyCredentials(username, password) {
    const user = USERS[username];

    if (!user) {
        return { valid: false, error: 'Invalid username or password' };
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
        return { valid: false, error: 'Invalid username or password' };
    }

    return { valid: true, user: { username: user.username } };
}

/**
 * Authentication Middleware - Protect routes
 */
function requireAuth(req, res, next) {
    // Check if user is authenticated
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required. Please login.'
        });
    }

    // User is authenticated, proceed
    next();
}

/**
 * Check if user is authenticated (for status checks)
 */
function isAuthenticated(req) {
    return req.session && req.session.user;
}

module.exports = {
    loginLimiter,
    verifyCredentials,
    requireAuth,
    isAuthenticated,
    hashPassword // Export for password generation utility
};
