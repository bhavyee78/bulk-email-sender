/**
 * Bulk Email Sender - Main Server
 * 
 * Zero AWS Billing Risk Architecture
 * 
 * Stack:
 * - Express.js (Node.js backend)
 * - SQLite (local database - no cloud costs)
 * - AWS SES (email sending only - free tier)
 * - Self-hosted open tracking
 * 
 * Cost Safety Guards:
 * 1. Daily email limit (default: 250)
 * 2. AWS SES quota checking
 * 3. Rate limiting
 * 4. All data stored locally
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const crypto = require('crypto');

// Initialize database
const { initializeDatabase } = require('./config/database');

// Import routes
const contactsRoutes = require('./routes/contacts');
const emailsRoutes = require('./routes/emails');
const trackingRoutes = require('./routes/tracking');
const authRoutes = require('./routes/auth');

// Import middleware
const { rateLimiter } = require('./middleware/quotaGuard');
const { requireAuth } = require('./middleware/auth');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// ===========================================
// MIDDLEWARE
// ===========================================

// Trust proxy (important for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Session configuration
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true, // Prevent XSS attacks
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict' // CSRF protection
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'DELETE', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting (100 requests per minute per IP)
app.use(rateLimiter(60000, 100));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// Request logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const user = req.session?.user?.username || 'anonymous';
    console.log(`[${timestamp}] ${req.method} ${req.path} - User: ${user}`);
    next();
});

// Serve static frontend files (login page accessible without auth)
app.use(express.static(path.join(__dirname, '../frontend')));

// ===========================================
// ROUTES
// ===========================================

// Public routes (no authentication required)
app.use('/api/auth', authRoutes);
app.use('/api/track', trackingRoutes); // Tracking pixels must be public

// Protected API routes (authentication required)
app.use('/api/contacts', requireAuth, contactsRoutes);
app.use('/api/emails', requireAuth, emailsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Configuration check endpoint (for debugging)
app.get('/api/config/check', (req, res) => {
    const config = {
        hasAwsAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
        hasAwsSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
        awsRegion: process.env.AWS_REGION || 'NOT SET',
        hasFromEmail: !!process.env.SES_FROM_EMAIL,
        fromEmailDomain: process.env.SES_FROM_EMAIL 
            ? process.env.SES_FROM_EMAIL.split('@')[1] 
            : 'NOT SET',
        dailyLimit: process.env.DAILY_EMAIL_LIMIT || 250,
        baseUrl: process.env.APP_BASE_URL || 'NOT SET'
    };
    
    const issues = [];
    
    if (!config.hasAwsAccessKey) issues.push('AWS_ACCESS_KEY_ID not set');
    if (!config.hasAwsSecretKey) issues.push('AWS_SECRET_ACCESS_KEY not set');
    if (config.awsRegion === 'NOT SET') issues.push('AWS_REGION not set');
    if (!config.hasFromEmail) issues.push('SES_FROM_EMAIL not set');
    if (config.baseUrl === 'NOT SET') issues.push('APP_BASE_URL not set (tracking may not work)');
    
    res.json({
        status: issues.length === 0 ? 'OK' : 'ISSUES_FOUND',
        config,
        issues,
        message: issues.length === 0 
            ? 'All required configuration is present'
            : 'Please fix the configuration issues above'
    });
});

// Serve frontend for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ===========================================
// ERROR HANDLING
// ===========================================

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    
    // Multer file size error
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            error: 'File too large',
            message: 'Maximum file size is 10MB'
        });
    }
    
    // Generic error response
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// ===========================================
// SERVER STARTUP
// ===========================================

// Initialize database and start server
function startServer() {
    // Ensure required directories exist
    const dirs = ['./uploads', './database'];
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
    
    // Initialize database schema
    initializeDatabase();
    
    // Validate configuration
    console.log('\n===========================================');
    console.log('📧 BULK EMAIL SENDER - STARTING');
    console.log('===========================================\n');
    
    // Check required environment variables
    const requiredEnvVars = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_REGION',
        'SES_FROM_EMAIL'
    ];
    
    const missingVars = requiredEnvVars.filter(v => !process.env[v]);
    
    if (missingVars.length > 0) {
        console.warn('⚠️  WARNING: Missing environment variables:');
        missingVars.forEach(v => console.warn(`   - ${v}`));
        console.warn('   Email sending will fail until these are configured.\n');
    } else {
        console.log('✅ All required environment variables are set\n');
    }
    
    // Display configuration summary
    console.log('📋 Configuration:');
    console.log(`   - Daily email limit: ${process.env.DAILY_EMAIL_LIMIT || 250}`);
    console.log(`   - AWS Region: ${process.env.AWS_REGION || 'NOT SET'}`);
    console.log(`   - From Email: ${process.env.SES_FROM_EMAIL || 'NOT SET'}`);
    console.log(`   - Base URL: ${process.env.APP_BASE_URL || 'NOT SET'}`);
    console.log('');
    
    // Start listening
    app.listen(PORT, () => {
        console.log('===========================================');
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`   Local: http://localhost:${PORT}`);
        console.log('===========================================\n');
    });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\nShutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\nShutting down gracefully...');
    process.exit(0);
});

// Start the server
startServer();

module.exports = app;
