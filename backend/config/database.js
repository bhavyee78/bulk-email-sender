/**
 * Database Configuration - SQLite (Zero Cloud Costs)
 * 
 * Using SQLite for:
 * - Zero AWS charges (no RDS, no DynamoDB)
 * - Simple file-based storage
 * - No external dependencies
 * - Easy backup (just copy the .db file)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure database directory exists
const dbDir = path.dirname(process.env.DATABASE_PATH || './database/emails.db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || './database/emails.db';
const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

/**
 * Initialize database schema
 */
function initializeDatabase() {
    // Contacts table - stores uploaded contacts
    db.exec(`
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            company_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Campaigns table - stores email campaigns
    db.exec(`
        CREATE TABLE IF NOT EXISTS campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Sent emails table - tracks individual email sends
    db.exec(`
        CREATE TABLE IF NOT EXISTS sent_emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER,
            contact_id INTEGER NOT NULL,
            tracking_id TEXT UNIQUE NOT NULL,
            subject TEXT NOT NULL,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'sent',
            error_message TEXT,
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
            FOREIGN KEY (contact_id) REFERENCES contacts(id)
        )
    `);

    // Open tracking table - records email opens
    db.exec(`
        CREATE TABLE IF NOT EXISTS email_opens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sent_email_id INTEGER NOT NULL,
            tracking_id TEXT NOT NULL,
            opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip_address TEXT,
            user_agent TEXT,
            country TEXT,
            city TEXT,
            device_type TEXT,
            email_client TEXT,
            FOREIGN KEY (sent_email_id) REFERENCES sent_emails(id)
        )
    `);

    // Link click tracking table
    db.exec(`
        CREATE TABLE IF NOT EXISTS link_clicks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sent_email_id INTEGER NOT NULL,
            tracking_id TEXT NOT NULL,
            link_url TEXT NOT NULL,
            clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip_address TEXT,
            user_agent TEXT,
            FOREIGN KEY (sent_email_id) REFERENCES sent_emails(id)
        )
    `);

    // Daily quota tracking - prevents exceeding limits
    db.exec(`
        CREATE TABLE IF NOT EXISTS daily_quota (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            emails_sent INTEGER DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create indexes for performance
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
        CREATE INDEX IF NOT EXISTS idx_sent_emails_tracking ON sent_emails(tracking_id);
        CREATE INDEX IF NOT EXISTS idx_sent_emails_contact ON sent_emails(contact_id);
        CREATE INDEX IF NOT EXISTS idx_email_opens_tracking ON email_opens(tracking_id);
        CREATE INDEX IF NOT EXISTS idx_daily_quota_date ON daily_quota(date);
    `);

    console.log('✅ Database initialized successfully');
}

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 */
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Get current daily email count
 */
function getDailyEmailCount() {
    const today = getTodayDate();
    const row = db.prepare('SELECT emails_sent FROM daily_quota WHERE date = ?').get(today);
    return row ? row.emails_sent : 0;
}

/**
 * Increment daily email count
 */
function incrementDailyCount(count = 1) {
    const today = getTodayDate();
    const stmt = db.prepare(`
        INSERT INTO daily_quota (date, emails_sent, last_updated)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(date) DO UPDATE SET 
            emails_sent = emails_sent + ?,
            last_updated = CURRENT_TIMESTAMP
    `);
    stmt.run(today, count, count);
}

/**
 * Check if we can send more emails today
 */
function canSendEmails(requestedCount = 1) {
    const limit = parseInt(process.env.DAILY_EMAIL_LIMIT) || 250;
    const currentCount = getDailyEmailCount();
    const remaining = limit - currentCount;
    
    return {
        canSend: remaining >= requestedCount,
        currentCount,
        limit,
        remaining,
        requestedCount
    };
}

module.exports = {
    db,
    initializeDatabase,
    getDailyEmailCount,
    incrementDailyCount,
    canSendEmails,
    getTodayDate
};
