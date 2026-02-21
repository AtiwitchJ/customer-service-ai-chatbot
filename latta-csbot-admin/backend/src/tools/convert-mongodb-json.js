#!/usr/bin/env node
/**
 * Convert MongoDB Extended JSON to Plain JSON for Import
 * แปลงไฟล์ MongoDB เป็นรูปแบบที่รองรับการ Import
 * 
 * Usage:
 *   node convert-mongodb-json.js <input-file> [output-file]
 * 
 * Examples:
 *   # Convert and save to specific file
 *   node convert-mongodb-json.js /app/import/chats.json /app/data/chats/sessions/imported.json
 *   
 *   # Convert and save to default location (data/chats/sessions/)
 *   node convert-mongodb-json.js /app/import/chats.json
 * 
 * Docker Usage:
 *   docker compose exec admin-backend node /app/tools/convert-mongodb-json.js /app/import/chats.json
 */

const fs = require('fs');
const path = require('path');

function convertMongoDBToPlainJSON(inputFile, outputFile) {
    console.log(`📖 Reading ${inputFile}...`);
    
    if (!fs.existsSync(inputFile)) {
        console.error(`❌ Error: File not found: ${inputFile}`);
        console.log('\n💡 Hint: Place your JSON file in the import-data/ folder');
        console.log('   Then run: docker compose cp import-data/yourfile.json admin-backend:/app/import/');
        process.exit(1);
    }
    
    const content = fs.readFileSync(inputFile, 'utf8');
    const data = JSON.parse(content);
    
    if (!Array.isArray(data)) {
        console.error('❌ Error: Expected JSON array');
        process.exit(1);
    }
    
    console.log(`🔍 Found ${data.length} records. Converting...`);
    
    const converted = data.map((item, index) => {
        // Convert messages
        const messages = (item.messages || []).map(msg => ({
            text: msg.text || '',
            role: msg.sender === 'bot' ? 'assistant' : (msg.sender || 'user'),
            time: extractDate(msg.time) || extractDate(msg.createdAt) || new Date().toISOString(),
            image_urls: msg.image_urls || []
        }));
        
        return {
            sessionId: item.sessionId || `session_${Date.now()}_${index}`,
            messages: messages,
            createdAt: extractDate(item.createdAt) || extractDate(item.updatedAt) || new Date().toISOString(),
            updatedAt: extractDate(item.updatedAt) || extractDate(item.createdAt) || new Date().toISOString()
        };
    });
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputFile, JSON.stringify(converted, null, 2));
    console.log(`✅ Converted ${converted.length} chats to ${outputFile}`);
    console.log('\n📄 Sample output:');
    console.log(JSON.stringify(converted[0], null, 2));
    console.log('\n🚀 To import individual sessions, run:');
    console.log(`   docker compose exec admin-backend node /app/tools/import-sessions.js ${outputFile}`);
}

function extractDate(value) {
    if (!value) return null;
    // Handle MongoDB Extended JSON: { "$date": "2026-02-03T09:09:04.542Z" }
    if (typeof value === 'object' && value.$date) {
        return value.$date;
    }
    // Handle MongoDB ObjectId: { "$oid": "..." }
    if (typeof value === 'object' && value.$oid) {
        return null;
    }
    // Already a string date
    if (typeof value === 'string') {
        return value;
    }
    return null;
}

// Usage
const inputFile = process.argv[2];
const outputFile = process.argv[3] || path.join('/app/data/chats/sessions', `imported_${Date.now()}.json`);

if (!inputFile) {
    console.log('Usage: node convert-mongodb-json.js <input-file> [output-file]');
    console.log('');
    console.log('Examples:');
    console.log('  node convert-mongodb-json.js /app/import/chats.json');
    console.log('  node convert-mongodb-json.js /app/import/chats.json /app/data/chats/sessions/my-chats.json');
    process.exit(1);
}

convertMongoDBToPlainJSON(inputFile, outputFile);
