export const environment = {
    production: false,
    // apiUrl: 'http://<SERVER_IP>:3002/api'  // Direct Development
    apiUrl: '/api',  // Nginx Proxy
    supabaseUrl: '', // Auto-filled by set-env.js
    supabaseKey: ''  // Auto-filled by set-env.js
};
