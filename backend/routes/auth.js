/**
 * Authentication Routes
 *
 * Handles user authentication:
 * - Login with rate limiting
 * - Logout
 * - Session status check
 */

const express = require('express');
const { loginLimiter, verifyCredentials, isAuthenticated } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/login
 * Login with username and password
 */
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate input
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username and password are required'
            });
        }

        // Verify credentials
        const result = await verifyCredentials(username, password);

        if (!result.valid) {
            // Add delay to prevent timing attacks
            await new Promise(resolve => setTimeout(resolve, 1000));

            return res.status(401).json({
                success: false,
                error: result.error
            });
        }

        // Create session
        req.session.user = {
            username: result.user.username,
            loginTime: new Date().toISOString()
        };

        // Save session
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to create session'
                });
            }

            console.log(`✅ User logged in: ${username}`);

            res.json({
                success: true,
                message: 'Login successful',
                user: {
                    username: result.user.username
                }
            });
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            details: error.message
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout and destroy session
 */
router.post('/logout', (req, res) => {
    const username = req.session?.user?.username || 'unknown';

    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({
                success: false,
                error: 'Logout failed'
            });
        }

        res.clearCookie('connect.sid');
        console.log(`👋 User logged out: ${username}`);

        res.json({
            success: true,
            message: 'Logout successful'
        });
    });
});

/**
 * GET /api/auth/status
 * Check authentication status
 */
router.get('/status', (req, res) => {
    if (isAuthenticated(req)) {
        res.json({
            success: true,
            authenticated: true,
            user: {
                username: req.session.user.username,
                loginTime: req.session.user.loginTime
            }
        });
    } else {
        res.json({
            success: true,
            authenticated: false
        });
    }
});

module.exports = router;
