const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from the root .env file
// Updated path: from src/environments/ -> ../../../../.env (root of project)
const envPath = path.resolve(__dirname, '../../../../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.warn(`⚠️  Warning: Could not load .env file from ${envPath}. Relying on system environment variables.`);
} else {
    console.log(`✅ Loaded environment variables from ${envPath}`);
}

const rawSupabaseUrl = process.env.SUPABASE_PUBLIC_URL || 'http://localhost:8000';
const supabaseUrl = rawSupabaseUrl.endsWith('/') ? rawSupabaseUrl : `${rawSupabaseUrl}/`;
const supabaseKey = process.env.ANON_KEY || '';

// Define content for environment.ts (Development)
const envConfigFile = `export const environment = {
    production: false,
    // เปลี่ยนเป็น IP ของ server หรือใช้ relative path
    // apiUrl: 'http://<SERVER_IP>:3002/api'  // สำหรับ development โดยตรง
    apiUrl: '/api',  // สำหรับใช้ผ่าน nginx proxy
    supabaseUrl: '${supabaseUrl}',
    supabaseKey: '${supabaseKey}'
};
`;

// Define content for environment.prod.ts (Production)
const envProdConfigFile = `export const environment = {
    production: true,
    apiUrl: '/api',
    supabaseUrl: '${supabaseUrl}',
    supabaseKey: '${supabaseKey}'
};
`;

// Write file to same directory (src/environments/environment.ts)
const targetPath = path.join(__dirname, './environment.ts');
fs.writeFile(targetPath, envConfigFile, (err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Output generated at ${targetPath}`);
});

// Write file to same directory (src/environments/environment.prod.ts)
const targetProdPath = path.join(__dirname, './environment.prod.ts');
fs.writeFile(targetProdPath, envProdConfigFile, (err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Output generated at ${targetProdPath}`);
});
