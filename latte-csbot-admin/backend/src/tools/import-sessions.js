#!/usr/bin/env node
/**
 * Import Sessions from Converted JSON
 * นำเข้า Sessions จากไฟล์ JSON ที่แปลงแล้ว
 * 
 * Usage:
 *   node import-sessions.js <converted-json-file>
 * 
 * Example:
 *   docker compose exec admin-backend node /app/tools/import-sessions.js /app/data/chats/sessions/imported_xxx.json
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/app/data/chats';
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const INDEX_DIR = path.join(DATA_DIR, 'index');

async function importSessions(inputFile) {
    console.log(`📖 Reading ${inputFile}...`);
    
    if (!fs.existsSync(inputFile)) {
        console.error(`❌ Error: File not found: ${inputFile}`);
        console.log(`\n🔍 Current directory: ${process.cwd()}`);
        console.log(`📁 Listing /app/import/:`);
        try {
            const files = fs.readdirSync('/app/import');
            console.log(files.join('\n'));
        } catch (e) {
            console.log('   (cannot read directory)');
        }
        process.exit(1);
    }
    
    // Ensure directories exist
    if (!fs.existsSync(SESSIONS_DIR)) {
        console.log(`📁 Creating sessions directory: ${SESSIONS_DIR}`);
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
    if (!fs.existsSync(INDEX_DIR)) {
        console.log(`📁 Creating index directory: ${INDEX_DIR}`);
        fs.mkdirSync(INDEX_DIR, { recursive: true });
    }
    
    const content = fs.readFileSync(inputFile, 'utf8');
    console.log(`📄 File size: ${content.length} bytes`);
    
    let data;
    try {
        data = JSON.parse(content);
    } catch (err) {
        console.error(`❌ JSON Parse Error: ${err.message}`);
        console.log(`🔍 First 200 chars: ${content.substring(0, 200)}`);
        process.exit(1);
    }
    
    if (!Array.isArray(data)) {
        console.error(`❌ Error: Expected JSON array, got ${typeof data}`);
        console.log(`🔍 Data type: ${Array.isArray(data) ? 'array' : typeof data}`);
        if (typeof data === 'object') {
            console.log(`🔍 Object keys: ${Object.keys(data).join(', ')}`);
        }
        process.exit(1);
    }
    
    console.log(`🔍 Found ${data.length} chats to import...\n`);
    
    // Log first item structure
    if (data.length > 0) {
        console.log(`📋 Sample first item structure:`);
        console.log(JSON.stringify(data[0], null, 2).substring(0, 500));
        console.log(`...\n`);
    }
    
    let success = 0;
    let failed = 0;
    const errors = [];
    const index = { sessions: {}, lastUpdated: new Date().toISOString() };
    
    for (let i = 0; i < data.length; i++) {
        const chat = data[i];
        console.log(`\n[${i + 1}/${data.length}] Processing chat...`);
        
        try {
            // Check sessionId
            const sessionId = chat.sessionId;
            console.log(`   sessionId: ${sessionId || 'MISSING'}`);
            
            if (!sessionId) {
                console.warn(`   ⚠️  Skipping: No sessionId`);
                errors.push({ index: i, reason: 'No sessionId', chat: JSON.stringify(chat).substring(0, 100) });
                failed++;
                continue;
            }
            
            // Check messages
            const messageCount = chat.messages?.length || 0;
            console.log(`   Messages: ${messageCount}`);
            
            if (!chat.messages || !Array.isArray(chat.messages)) {
                console.warn(`   ⚠️  Warning: No messages array`);
            }
            
            // Add updated timestamp
            chat.updatedAt = new Date().toISOString();
            
            // Save individual session file
            const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
            console.log(`   Saving to: ${sessionFile}`);
            
            try {
                fs.writeFileSync(sessionFile, JSON.stringify(chat, null, 2));
                console.log(`   ✅ File saved successfully`);
            } catch (writeErr) {
                console.error(`   ❌ File write error: ${writeErr.message}`);
                errors.push({ index: i, reason: `Write error: ${writeErr.message}`, sessionId });
                failed++;
                continue;
            }
            
            // Update index
            index.sessions[sessionId] = {
                updatedAt: chat.updatedAt,
                createdAt: chat.createdAt,
                hasFeedback: chat.messages?.some(m => m.feedback) || false,
                messageCount: messageCount
            };
            
            success++;
            console.log(`   ✅ Imported: ${sessionId}`);
            
        } catch (err) {
            console.error(`   ❌ Unexpected error: ${err.message}`);
            console.error(`   Stack: ${err.stack}`);
            errors.push({ index: i, reason: err.message, stack: err.stack });
            failed++;
        }
    }
    
    // Save index
    console.log(`\n💾 Saving index...`);
    const indexPath = path.join(INDEX_DIR, 'sessions_index.json');
    try {
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
        console.log(`   ✅ Index saved: ${indexPath}`);
    } catch (err) {
        console.error(`   ❌ Index save error: ${err.message}`);
    }
    
    // Summary
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 Import Summary:`);
    console.log(`   ✅ Success: ${success}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📁 Sessions saved to: ${SESSIONS_DIR}`);
    console.log(`   📋 Index: ${indexPath}`);
    
    // List files in sessions directory
    console.log(`\n📂 Files in ${SESSIONS_DIR}:`);
    try {
        const files = fs.readdirSync(SESSIONS_DIR);
        console.log(`   Total files: ${files.length}`);
        files.slice(0, 10).forEach(f => console.log(`   - ${f}`));
        if (files.length > 10) console.log(`   ... and ${files.length - 10} more`);
    } catch (e) {
        console.log(`   Error reading directory: ${e.message}`);
    }
    
    // Show errors if any
    if (errors.length > 0) {
        console.log(`\n❌ Errors (${errors.length}):`);
        errors.slice(0, 5).forEach((err, idx) => {
            console.log(`   ${idx + 1}. [${err.index}] ${err.reason}`);
        });
        if (errors.length > 5) {
            console.log(`   ... and ${errors.length - 5} more errors`);
        }
    }
    
    if (success > 0) {
        console.log(`\n🎉 Import complete!`);
        console.log(`📝 To apply changes, restart the backend:`);
        console.log(`   docker compose restart admin-backend`);
    } else {
        console.log(`\n⚠️  No sessions were imported. Please check the errors above.`);
    }
}

const inputFile = process.argv[2];

if (!inputFile) {
    console.log('Usage: node import-sessions.js <converted-json-file>');
    console.log('');
    console.log('Example:');
    console.log('  docker compose exec admin-backend node /app/tools/import-sessions.js /app/data/chats/sessions/imported_xxx.json');
    console.log('');
    console.log('Find converted files:');
    console.log('  docker compose exec admin-backend ls -la /app/data/chats/sessions/');
    process.exit(1);
}

importSessions(inputFile);
