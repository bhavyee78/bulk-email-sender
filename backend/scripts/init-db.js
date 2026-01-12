/**
 * Database Initialization Script
 * 
 * Run this script to initialize/reset the database:
 * npm run init-db
 */

require('dotenv').config();

const { initializeDatabase, db } = require('../config/database');
const fs = require('fs');
const path = require('path');

console.log('===========================================');
console.log('📦 DATABASE INITIALIZATION');
console.log('===========================================\n');

// Ensure database directory exists
const dbDir = path.dirname(process.env.DATABASE_PATH || './database/emails.db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`✅ Created database directory: ${dbDir}`);
}

// Initialize database schema
try {
    initializeDatabase();
    console.log('✅ Database schema initialized successfully\n');
    
    // Display table info
    const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();
    
    console.log('📋 Tables created:');
    tables.forEach(table => {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        console.log(`   - ${table.name} (${count.count} rows)`);
    });
    
    console.log('\n✅ Database is ready for use!');
    
} catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    process.exit(1);
}

console.log('\n===========================================\n');
