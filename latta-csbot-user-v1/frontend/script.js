/**
 * =============================================================================
 * CP ALL Connect - Frontend Chat Application
 * =============================================================================
 * 
 * Interactive chat interface for CP ALL customer support
 * 
 * @module script
 */

// =============================================================================
// 🔒 SECURITY: Prototype Pollution Protection
// A03:2021 - Freeze prototypes to prevent pollution attacks
// ป้องกันการโจมตีแบบ Prototype Pollution
// =============================================================================
(function () {
    'use strict';
    try {
        Object.freeze(Object.prototype);
        Object.freeze(Array.prototype);
        Object.freeze(Function.prototype);
        console.log('[SECURITY] Prototypes frozen successfully');
    } catch (e) {
        console.error('[SECURITY] Failed to freeze prototypes:', e);
    }
})();

// =============================================================================
// 🔒 SECURITY: Module Scope (DOM Clobbering Protection)
// Wrap entire code in IIFE to prevent DOM Clobbering attacks
// ห่อ code ทั้งหมดใน IIFE เพื่อป้องกัน DOM Clobbering
// =============================================================================
(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // Session ID Management (Moved to top to prevent ReferenceError)
    // -------------------------------------------------------------------------
    function getCookie(name) {
        const nameEQ = `${name}=`;
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            cookie = cookie.trim();
            if (cookie.indexOf(nameEQ) === 0) return decodeURIComponent(cookie.substring(nameEQ.length));
        }
        return null;
    }

    function setCookie(name, value, minutes) {
        let expires = '';
        if (minutes) {
            const date = new Date();
            date.setTime(date.getTime() + minutes * 60 * 1000);
            expires = `; expires=${date.toUTCString()}; SameSite=Strict; path=/`;
            if (location.protocol === 'https:') expires += '; Secure';
        }
        document.cookie = `${name}=${encodeURIComponent(value)}${expires}`;
    }

    let sessionId = getCookie('sessionId');
    if (!sessionId) {
        sessionId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2);
        setCookie('sessionId', sessionId, 10);
    } else {
        setCookie('sessionId', sessionId, 10);
    }

    // API Configuration
    let API_BASE = '/api';
    let WEBHOOK_URL = '';
    let ws = null;

    // Timer references for auto-logout
    let afkTimer;
    let afkWarningTimer;
    let afkCountdownInterval;
    let backgroundTimer;

    const STORAGE_KEY_SUGGESTIONS = `cpall_suggestions_${sessionId}`;
    
    // Timeouts - จะถูกโหลดจาก server config
    let AFK_LIMIT = 5 * 60 * 1000;           // Default: 5 minutes
    let AFK_WARNING_TIME = 30 * 1000;        // Default: 30 seconds
    let BACKGROUND_LIMIT = 3 * 60 * 1000;    // Default: 3 minutes
    let WS_RECONNECT_DELAY = 5000;           // Default: 5 seconds
    const MAX_HEIGHT_PX = 150;

    // -------------------------------------------------------------------------
    // DOM Element References
    // อ้างอิง DOM Elements
    // -------------------------------------------------------------------------
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const menuBtn = document.getElementById('menuBtn');
    const loginSection = document.getElementById('loginSection');
    const loginForm = document.getElementById('loginForm');
    const chatForm = document.getElementById('chatForm');
    const loginErrorMsg = document.getElementById('loginError');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const typingIndicator = document.getElementById('typingIndicator');
    const floatingPills = document.getElementById('floatingPills');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const afkWarningPopup = document.getElementById('afkWarningPopup');
    const afkCountdownEl = document.getElementById('afkCountdown');

    // =========================================================================
    // Section 2: Security Helper Functions 🔒
    // ส่วนที่ 2: ฟังก์ชันช่วยเหลือด้านความปลอดภัย
    // =========================================================================

    /**
     * Escape HTML special characters to prevent XSS attacks
     * แปลงอักขระพิเศษ HTML เพื่อป้องกัน XSS
     * 
     * @param {string} text - Raw text input
     * @returns {string} Escaped safe text
     */
    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/`/g, '&#x60;');
    }

    /**
     * Validate email format
     * ตรวจสอบรูปแบบอีเมล
     * 
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     */
    function isValidEmail(email) {
        if (!email || typeof email !== 'string') return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) && email.length <= 254;
    }

    /**
     * Validate Card ID format (alphanumeric, 5-20 characters)
     * ตรวจสอบรูปแบบ Card ID (ตัวอักษรและตัวเลข 5-20 ตัว)
     * 
     * @param {string} cardId - Card ID to validate
     * @returns {boolean} True if valid
     */
    function isValidCardID(cardId) {
        if (!cardId || typeof cardId !== 'string') return false;
        return /^[a-zA-Z0-9]{5,20}$/.test(cardId);
    }

    /**
     * Sanitize input text (trim and limit length)
     * ทำความสะอาด input (ตัดช่องว่างและจำกัดความยาว)
     * 
     * @param {string} text - Text to sanitize
     * @param {number} maxLength - Maximum allowed length
     * @returns {string} Sanitized text
     */
    function sanitizeInput(text, maxLength = 2000) {
        if (!text || typeof text !== 'string') return '';
        return text.trim().slice(0, maxLength);
    }

    /**
     * Detect potential injection attacks in input
     * ตรวจจับการโจมตีแบบ injection ใน input
     * 
     * @param {string} text - Text to check
     * @returns {boolean} True if malicious pattern detected
     */
    function detectMaliciousInput(text) {
        if (!text) return false;
        const maliciousPatterns = [
            /<script/i,           // Script injection
            /javascript:/i,       // JavaScript protocol
            /on\w+\s*=/i,         // Event handlers (onclick, onerror, etc.)
            /\$where/i,           // MongoDB injection
            /\$gt|\$lt|\$ne/i     // MongoDB operators
        ];
        return maliciousPatterns.some(pattern => pattern.test(text));
    }

    // Section 3 (MOVED TO TOP)


    // =========================================================================
    // Section 4: UI Helper Functions
    // ส่วนที่ 4: ฟังก์ชันช่วยเหลือ UI
    // =========================================================================

    /**
     * Auto-expand textarea based on content
     * ขยาย textarea อัตโนมัติตามเนื้อหา
     * 
     * @param {HTMLElement} element - Textarea element
     */
    function autoExpandTextarea(element) {
        element.style.height = 'auto';
        let newHeight = element.scrollHeight;

        if (newHeight > MAX_HEIGHT_PX) {
            newHeight = MAX_HEIGHT_PX;
            element.style.overflowY = 'auto';
        } else {
            element.style.overflowY = 'hidden';
        }

        element.style.height = `${newHeight}px`;
        checkInput();
    }

    /**
     * Clear all chat messages except typing indicator
     * ล้างข้อความแชททั้งหมดยกเว้น typing indicator
     */
    function clearChatMessages() {
        Array.from(chatMessages.children).forEach(child => {
            const shouldKeep = child.id === 'typingIndicator' ||
                child.classList.contains('floating-pills');
            if (!shouldKeep) child.remove();
        });
    }

    /**
     * Check input and update send button state
     * ตรวจสอบ input และอัพเดทสถานะปุ่มส่ง
     */
    function checkInput() {
        if (!userInput.disabled) {
            sendBtn.disabled = userInput.value.trim().length === 0;
        }
    }

    /**
     * Set chat input enabled/disabled state
     * ตั้งค่าสถานะ enabled/disabled ของ chat input
     * 
     * @param {boolean} enabled - Whether input should be enabled
     */
    function setChatInputState(enabled) {
        userInput.disabled = !enabled;
        sendBtn.disabled = enabled ? userInput.value.trim() === '' : true;
        // menuBtn ไม่ต้อง disable เพราะต้องการให้กดได้ตลอด (สำหรับ logout)
        // if (menuBtn) menuBtn.disabled = !enabled;

        if (enabled) {
            userInput.focus();
            typingIndicator.classList.add('d-none');
        } else {
            typingIndicator.classList.remove('d-none');
        }
    }

    /**
     * Toggle sidebar menu visibility
     * สลับการแสดง/ซ่อน sidebar menu
     */
    function handleMenuClick() {
        const isActive = floatingPills.classList.contains('active');
        const elements = [floatingPills, menuBtn, sidebarBackdrop];

        elements.forEach(el => {
            if (isActive) {
                el.classList.remove('active');
            } else {
                el.classList.add('active');
            }
        });
    }



    // =========================================================================
    // Section 5: Network & API Functions
    // ส่วนที่ 5: ฟังก์ชันเครือข่ายและ API
    // =========================================================================

    /**
     * Load configuration from server
     * โหลดการตั้งค่าจากเซิร์ฟเวอร์
     */
    async function loadConfig() {
        try {
            const res = await fetch(`${API_BASE}/config`);
            const config = await res.json();
            WEBHOOK_URL = `${API_BASE}/webhook/send`;
            
            // โหลดค่า timeouts จาก server (ถ้ามี)
            if (config.AFK_TIMEOUT_MS) AFK_LIMIT = config.AFK_TIMEOUT_MS;
            if (config.AFK_WARNING_MS) AFK_WARNING_TIME = config.AFK_WARNING_MS;
            if (config.BACKGROUND_TIMEOUT_MS) BACKGROUND_LIMIT = config.BACKGROUND_TIMEOUT_MS;
            if (config.WS_RECONNECT_DELAY_MS) WS_RECONNECT_DELAY = config.WS_RECONNECT_DELAY_MS;
            
            console.log('[Config] Loaded timeouts from server:', {
                AFK_LIMIT, AFK_WARNING_TIME, BACKGROUND_LIMIT, WS_RECONNECT_DELAY
            });
        } catch (error) {
            console.error('Config load failed:', error);
            WEBHOOK_URL = `${API_BASE}/webhook/send`;
        }
    }

    /**
     * Check user login status from server
     * ตรวจสอบสถานะการเข้าสู่ระบบจากเซิร์ฟเวอร์
     */
    async function checkLoginStatus() {
        try {
            const res = await fetch(`${API_BASE}/auth/check-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });
            const data = await res.json();

            if (data.status === 'verified') {
                // Authenticated - show chat interface
                // ผู้ใช้เข้าสู่ระบบแล้ว - แสดงหน้าแชท
                loginSection.classList.add('d-none');
                await loadChatHistory();
                restoreSavedSuggestions();
                setChatInputState(true);
                startAutoLogoutMonitoring();
            } else {
                // User not logged in - show login form
                // ผู้ใช้ยังไม่เข้าสู่ระบบ - แสดงฟอร์มเข้าสู่ระบบ
                loginSection.classList.remove('d-none');
                setChatInputState(false);
            }
        } catch (error) {
            console.error('Check status failed:', error);
            loginSection.classList.remove('d-none');
            setChatInputState(false);
        }
    }

    /**
     * Restore saved suggestions from localStorage
     * กู้คืน suggestions ที่บันทึกไว้จาก localStorage
     */
    function restoreSavedSuggestions() {
        const savedSuggestions = localStorage.getItem(STORAGE_KEY_SUGGESTIONS);
        if (!savedSuggestions) return;

        try {
            const suggestions = JSON.parse(savedSuggestions);
            if (suggestions && suggestions.length > 0) {
                addSuggestions(suggestions);
            }
        } catch (error) {
            console.error('Restore suggestions error:', error);
        }
    }

    /**
     * Load chat history from server
     * โหลดประวัติแชทจากเซิร์ฟเวอร์
     */
    async function loadChatHistory() {
        try {
            // Skip if messages already loaded
            // ข้ามถ้าโหลดข้อความแล้ว
            if (chatMessages.querySelectorAll('.message-item').length > 0) return;

            const res = await fetch(`${API_BASE}/chat/history/${sessionId}`);
            if (!res.ok) throw new Error(`Server returned ${res.status}`);

            const history = await res.json();
            if (history && history.length > 0) {
                // history.forEach(msg => {
                //     const isError = msg.text.startsWith('❌') || msg.text.startsWith('⚠️');
                //     addMessage(msg.text, msg.sender, isError, msg.time, msg.msgId, msg.feedback, msg.image_urls);
                // });
                history.forEach(msg => {
                    const isError = msg.text.startsWith('❌') || msg.text.startsWith('⚠️');
                    addMessage(msg.text, msg.sender, isError, msg.time, msg.msgId, msg.feedback, msg.image_urls);
                });
                chatMessages.scrollTo(0, chatMessages.scrollHeight);
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        }
    }

    /**
     * Establish WebSocket connection for real-time updates
     * สร้างการเชื่อมต่อ WebSocket สำหรับอัพเดทแบบ real-time
     */
    function connectWebSocket() {
        try {
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${location.host}/ws`;

            ws = new WebSocket(wsUrl);

            // Connection opened - send session init
            // เชื่อมต่อสำเร็จ - ส่ง session init
            ws.onopen = () => {
                ws.send(JSON.stringify({ type: 'init', sessionId }));
            };

            // Handle incoming messages
            // จัดการข้อความที่เข้ามา
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleWebSocketMessage(data);
                } catch (error) {
                    console.error('WS Message Error:', error);
                }
            };

            // Auto-reconnect on close
            // เชื่อมต่อใหม่อัตโนมัติเมื่อหลุด
            ws.onclose = () => {
                setTimeout(connectWebSocket, WS_RECONNECT_DELAY);
            };

            ws.onerror = (error) => {
                console.error('WS Error:', error);
            };
        } catch (error) {
            console.error('WS Connection Failed:', error);
        }
    }

    /**
     * Handle WebSocket message based on type
     * จัดการข้อความ WebSocket ตามประเภท
     * 
     * @param {object} data - Parsed WebSocket message
     */
    function handleWebSocketMessage(data) {
        // Re-enable input on reply or error
        // เปิดใช้งาน input เมื่อได้รับ reply หรือ error
        if (data.type === 'chat_reply' || data.type === 'chat_error') {
            const count = 0; // Images disabled
            // console.log(`[WS] Received: ${count} images`, data);

            typingIndicator.classList.add('d-none');
            setChatInputState(true);
            autoExpandTextarea(userInput);
        }

        if (data.type === 'chat_reply' && data.reply) {
            // Pass image_urls from WebSocket data to addMessage
            addMessage(data.reply, 'bot', false, null, data.msgId, null, data.image_urls);

            // Auto-suggest based on reply content
            // แนะนำอัตโนมัติตามเนื้อหาคำตอบ
            if (data.reply.includes('ต้องการ')) {
                addSuggestions(['ฉันต้องการ', 'ฉันไม่ต้องการ']);
            }

            if (data.suggestions) {
                addSuggestions(data.suggestions);
            }
        } else if (data.type === 'chat_error' && data.reply) {
            addMessage(data.reply, 'bot', true, null, data.msgId);
        }
    }


    // =========================================================================
    // Section 6: Authentication Functions
    // ส่วนที่ 6: ฟังก์ชันการยืนยันตัวตน
    // =========================================================================

    /**
     * Handle user login form submission
     * จัดการการส่งฟอร์มเข้าสู่ระบบ
     */
    async function handleLogin(e) {
        if (e) e.preventDefault();
        const CardID = document.getElementById('loginCardID').value.trim();
        const Email = document.getElementById('loginEmail').value.trim();

        // ---------------------------------------------------------------------
        // Input Validation (A07:2021)
        // ตรวจสอบ input
        // ---------------------------------------------------------------------
        if (CardID.length === 0 || Email.length === 0) {
            showLoginError('กรุณากรอกข้อมูลให้ครบถ้วน');
            return;
        }

        if (!isValidCardID(CardID)) {
            showLoginError('รูปแบบ CardID ไม่ถูกต้อง (ตัวอักษรและตัวเลข 5-20 ตัว)');
            return;
        }

        if (!isValidEmail(Email)) {
            showLoginError('รูปแบบอีเมลไม่ถูกต้อง');
            return;
        }

        // Check for malicious input (A03:2021)
        // ตรวจสอบ input ที่เป็นอันตราย
        if (detectMaliciousInput(CardID) || detectMaliciousInput(Email)) {
            showLoginError('ตรวจพบข้อมูลที่ไม่ปลอดภัย');
            console.warn('[SECURITY] Malicious input detected in login form');
            return;
        }

        // ---------------------------------------------------------------------
        // UI Loading State
        // แสดงสถานะกำลังโหลด
        // ---------------------------------------------------------------------
        loginErrorMsg.classList.add('d-none');
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.innerHTML = createLoadingSpinner() + ' กำลังตรวจสอบ...';

        // ---------------------------------------------------------------------
        // Send Login Request
        // ส่งคำขอเข้าสู่ระบบ
        // ---------------------------------------------------------------------
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    CardID: sanitizeInput(CardID, 20),
                    Email: sanitizeInput(Email, 254)
                })
            });

            const data = await res.json();

            if (res.ok && data.status === 'success') {
                // Login successful - initialize chat
                // เข้าสู่ระบบสำเร็จ - เริ่มต้นแชท
                checkLoginStatus();
                clearChatMessages();
                showWelcomeMessage();
            } else {
                // A09:2021 - Don't expose detailed error info
                // ไม่แสดงรายละเอียด error เพื่อความปลอดภัย
                showLoginError(data.message || 'การยืนยันตัวตนล้มเหลว');
            }
        } catch (error) {
            console.error('Login error:', error);
            showLoginError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
        } finally {
            loginSubmitBtn.disabled = false;
            loginSubmitBtn.innerText = 'เข้าใช้งาน';
        }
    }

    /**
     * Show login error message
     * แสดงข้อความ error การเข้าสู่ระบบ
     * 
     * @param {string} message - Error message to display
     */
    function showLoginError(message) {
        loginErrorMsg.innerText = message;
        loginErrorMsg.classList.remove('d-none');
    }

    /**
     * Create loading spinner SVG
     * สร้าง SVG loading spinner
     * 
     * @returns {string} SVG HTML string
     */
    function createLoadingSpinner() {
        return `<svg class="animate-spin" style="width:16px;height:16px;margin-right:8px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>`;
    }

    /**
     * Show welcome message after login
     * แสดงข้อความต้อนรับหลังเข้าสู่ระบบ
     */
    function showWelcomeMessage() {
        setTimeout(() => {
            addMessage(
                'สวัสดีครับ! ยินดีต้อนรับสู่ CP ALL Connect\nมีอะไรให้ผมช่วยไหมครับ?',
                'bot',
                false,
                null,
                'welcome-msg'
            );
            addSuggestions([
                'ลืม/ไม่ทราบ Username Password',
                "ระบบแจ้งเตือน 'ชื่อหรือรหัสผ่านของท่านไม่ถูกต้อง'",
                'เปลี่ยนรหัสผ่านไม่ได้',
                'ไม่พบหลักสูตร',
                'ปัญหาอื่นๆ'
            ]);
        }, 500);
    }

    // =========================================================================
    // Section 7: Chat Message Functions
    // ส่วนที่ 7: ฟังก์ชันข้อความแชท
    // =========================================================================

    /**
     * Send chat message to server
     * ส่งข้อความแชทไปยังเซิร์ฟเวอร์
     * 
     * @param {string} text - Message text (optional, uses input value if not provided)
     */
    async function sendMessage(text) {
        if (!text) text = userInput.value.trim();
        if (!text) return;

        // Sanitize input (A03:2021)
        // ทำความสะอาด input
        text = sanitizeInput(text, 2000);
        if (text.length === 0) {
            console.warn('Empty message after sanitization');
            return;
        }

        // Check for malicious input (A03:2021)
        // ตรวจสอบ input ที่เป็นอันตราย
        if (detectMaliciousInput(text)) {
            addMessage('⚠️ ข้อความมีรูปแบบที่ไม่ปลอดภัย กรุณาลองใหม่', 'bot', true);
            console.warn('[SECURITY] Malicious input detected in chat message');
            return;
        }

        // Set webhook URL if not set
        if (!WEBHOOK_URL) WEBHOOK_URL = `${API_BASE}/webhook/send`;

        // Clear saved suggestions
        // ล้าง suggestions ที่บันทึกไว้
        localStorage.removeItem(STORAGE_KEY_SUGGESTIONS);
        document.querySelectorAll('.chat-suggestions').forEach(el => el.remove());

        // Update UI state
        // อัพเดทสถานะ UI
        typingIndicator.classList.remove('d-none');
        setChatInputState(false);
        addMessage(text, 'user');
        userInput.value = '';
        autoExpandTextarea(userInput);
        checkInput();
        chatMessages.scrollTo(0, chatMessages.scrollHeight);

        // Send message to server
        // ส่งข้อความไปยังเซิร์ฟเวอร์
        try {
            // Get user's public IP (optional)
            // ดึง IP สาธารณะของผู้ใช้ (ไม่บังคับ)
            let ipid = { public: 'unknown' };
            try {
                const ipRes = await fetch('https://api.ipify.org?format=json');
                ipid = await ipRes.json();
            } catch (e) { /* Ignore IP fetch errors */ }

            const res = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, sessionId, ipid })
            });

            const data = await res.json();
            if (!res.ok || data.status === 'error') {
                throw new Error(data.message || `Server Error: ${res.status}`);
            }
        } catch (error) {
            console.error('Send Error:', error);
            typingIndicator.classList.add('d-none');
            // A09:2021 - Don't expose detailed error info
            addMessage('❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง', 'bot', true);
            setChatInputState(true);
            autoExpandTextarea(userInput);
        }
    }

    /**
     * Send feedback for a bot message
     * ส่ง feedback สำหรับข้อความ bot
     * 
     * @param {string} msgId - Message ID
     * @param {string} action - Feedback action ('like' or 'dislike')
     * @param {HTMLElement} btnElement - Button element clicked
     */
    async function sendFeedback(msgId, action, btnElement) {
        if (!msgId) return;

        const parent = btnElement.parentElement;
        const isAlreadyActive = btnElement.classList.contains('active');

        // Clear all active states
        // ล้างสถานะ active ทั้งหมด
        parent.querySelectorAll('.feedback-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Toggle or set new action
        // สลับหรือตั้งค่า action ใหม่
        let finalAction = action;
        if (isAlreadyActive) {
            finalAction = 'none';
        } else {
            btnElement.classList.add('active');
        }

        try {
            await fetch(`${API_BASE}/chat/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, msgId, action: finalAction })
            });
        } catch (error) {
            console.error('Feedback error:', error);
        }
    }


    // =========================================================================
    // Section 8: Message Rendering Functions
    // ส่วนที่ 8: ฟังก์ชันแสดงผลข้อความ
    // =========================================================================

    /**
     * Add suggestion chips to chat
     * เพิ่มปุ่ม suggestion ในแชท
     * 
     * @param {string[]} suggestions - Array of suggestion texts
     */
    function addSuggestions(suggestions) {
        // Remove existing suggestions
        // ลบ suggestions ที่มีอยู่
        document.querySelectorAll('.chat-suggestions').forEach(el => el.remove());

        if (!suggestions || suggestions.length === 0) return;

        // Sanitize and save suggestions
        // ทำความสะอาดและบันทึก suggestions
        const safeSuggestions = suggestions.map(s => escapeHtml(s));
        localStorage.setItem(STORAGE_KEY_SUGGESTIONS, JSON.stringify(safeSuggestions));

        // Create suggestions container
        // สร้าง container สำหรับ suggestions
        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'chat-suggestions';

        // Create suggestion chips
        // สร้างปุ่ม suggestion
        suggestions.forEach(text => {
            const chip = document.createElement('div');
            chip.className = 'suggestion-chip';
            chip.innerText = text;
            chip.onclick = () => {
                suggestionsDiv.remove();
                sendMessage(text);
            };
            suggestionsDiv.appendChild(chip);
        });

        // Insert before typing indicator or append to end
        // แทรกก่อน typing indicator หรือเพิ่มท้ายสุด
        if (typingIndicator && typingIndicator.parentNode === chatMessages) {
            chatMessages.insertBefore(suggestionsDiv, typingIndicator);
        } else {
            chatMessages.appendChild(suggestionsDiv);
        }
        chatMessages.scrollTo(0, chatMessages.scrollHeight);
    }

    /**
     * Process message text - handle trusted links and special formats
     * ประมวลผลข้อความ - จัดการลิงก์ที่เชื่อถือได้และรูปแบบพิเศษ
     * 
     * Supported formats:
     * - [FORM_BUTTON:url] - Clickable form button image
     * - <a href="https://..."><img ...></a> - Clickable images
     * - <a href="https://...">text</a> - Text links
     * - https://... - Auto-linked URLs
     * 
     * @param {string} text - Raw message text
     * @returns {string} Processed HTML-safe text
     */
    function processMessageText(text) {
        const linkPlaceholders = [];

        /**
         * Extract attribute value from HTML tag string
         * ดึงค่า attribute จาก HTML tag string
         */
        function extractAttr(tagStr, attrName) {
            const regex = new RegExp(`${attrName}=["']([^"']*)["']`, 'i');
            const match = tagStr.match(regex);
            return match ? match[1] : null;
        }

        // ---------------------------------------------------------------------
        // Pattern 0: [FORM_BUTTON:url|image_url] - Custom format for form buttons
        // รูปแบบ 0: [FORM_BUTTON:url|image_url] - รูปแบบพิเศษสำหรับปุ่มฟอร์ม
        // ---------------------------------------------------------------------
        // Update: Support optional image URL (url|image) - NOW REMOVED IMAGE SUPPORT
        // Fix: Use only URL part
        const formButtonRegex = /\[FORM_BUTTON:([^|\]]+)(?:\|([^\]]+))?\]/gi;
        let processedText = text.replace(formButtonRegex, (match, url) => {
            const placeholder = `___FORMBUTTON_${linkPlaceholders.length}___`;
            // Force null image
            linkPlaceholders.push({ type: 'formbutton', url: url.trim(), imgUrl: null });
            return placeholder;
        });



        // ---------------------------------------------------------------------
        // Pattern 2: <a ...>text</a> - Text links
        // รูปแบบ 2: <a ...>text</a> - ลิงก์ข้อความ
        // ---------------------------------------------------------------------
        const textLinkRegex = /<a\s+([^>]+)>([^<]+)<\/a>/gi;
        processedText = processedText.replace(textLinkRegex, (match, aAttrs, label) => {
            const href = extractAttr(aAttrs, 'href');

            if (href && href.startsWith('https://')) {
                const placeholder = `___LINK_${linkPlaceholders.length}___`;
                linkPlaceholders.push({ type: 'textlink', url: href, label: label.trim() });
                return placeholder;
            }
            return match;
        });



        // ---------------------------------------------------------------------
        // Pattern 3: Plain URLs - Auto-link
        // รูปแบบ 3: URL ธรรมดา - ทำลิงก์อัตโนมัติ
        // ---------------------------------------------------------------------
        const urlRegex = /(^|[^"'=])(https?:\/\/[^\s<>"']+)/gi;
        processedText = processedText.replace(urlRegex, (match, prefix, url) => {
            // Fix: If URL ends with ')' which is common in markdown failure cases, strip it
            let suffix = '';
            if (url.endsWith(')')) {
                url = url.slice(0, -1);
                suffix = ')';
            }
            // Strip trailing dot or comma often found in text
            if (url.endsWith('.') || url.endsWith(',')) {
                suffix = url.slice(-1) + suffix;
                url = url.slice(0, -1);
            }

            const placeholder = `___AUTOLINK_${linkPlaceholders.length}___`;
            linkPlaceholders.push({ type: 'autolink', url });
            return prefix + placeholder + suffix;
        });

        // ---------------------------------------------------------------------
        // Escape all HTML to prevent XSS
        // Escape HTML ทั้งหมดเพื่อป้องกัน XSS
        // ---------------------------------------------------------------------
        processedText = escapeHtml(processedText);

        // ---------------------------------------------------------------------
        // Restore trusted links with safe HTML
        // กู้คืนลิงก์ที่เชื่อถือได้ด้วย HTML ที่ปลอดภัย
        // ---------------------------------------------------------------------
        for (let i = 0; i < linkPlaceholders.length; i++) {
            const item = linkPlaceholders[i];
            const safeAttrs = 'target="_blank" rel="noopener noreferrer"';

            switch (item.type) {
                case 'formbutton':
                    // Form button - display as clickable image
                    // ปุ่มฟอร์ม - แสดงเป็นรูปภาพที่กดได้
                    const btnImg = item.imgUrl || "image/6f4176f2-c746-4d37-a187-ae594296d032.png";
                    processedText = processedText.replace(
                        `___FORMBUTTON_${i}___`,
                        `<a href="${item.url}" ${safeAttrs}><img src="${btnImg}" alt="กรอกแบบฟอร์ม" style="max-width:100%;border-radius:8px;cursor:pointer;"></a>`
                    );
                    break;



                case 'textlink':
                    // Text link
                    // ลิงก์ข้อความ
                    processedText = processedText.replace(
                        `___LINK_${i}___`,
                        `<a href="${item.url}" ${safeAttrs}>${escapeHtml(item.label)}</a>`
                    );
                    break;

                case 'autolink':
                    // Auto-linked URL - truncate display if too long
                    // URL ที่ทำลิงก์อัตโนมัติ - ตัดการแสดงผลถ้ายาวเกินไป
                    const displayUrl = item.url.length > 50
                        ? item.url.substring(0, 47) + '...'
                        : item.url;
                    processedText = processedText.replace(
                        `___AUTOLINK_${i}___`,
                        `<a href="${item.url}" ${safeAttrs}>${escapeHtml(displayUrl)}</a>`
                    );
                    break;
            }
        }

        // Convert newlines to <br> and tabs to non-breaking spaces
        // แปลง newline เป็น <br> และ tab เป็น spaces
        return processedText.replace(/\n/g, '<br>').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
    }

    /**
     * Add a message to the chat display
     * เพิ่มข้อความในหน้าแชท
     * 
     * @param {string} text - Message text
     * @param {string} sender - 'user' or 'bot'
     * @param {boolean} isError - Whether this is an error message
     * @param {string|null} customTime - Custom timestamp (optional)
     * @param {string|null} msgId - Message ID for feedback (optional)
     * @param {string|null} existingFeedback - Existing feedback state (optional)
     * @param {string[]} imageUrls - Array of image URLs to display (optional)
     */
    function addMessage(text, sender, isError = false, customTime = null, msgId = null, existingFeedback = null, imageUrls = []) {
        // Process text based on sender
        // ประมวลผลข้อความตามผู้ส่ง
        let formattedText;
        if (sender === 'bot') {
            // Bot messages: process trusted links
            // ข้อความ bot: ประมวลผลลิงก์ที่เชื่อถือได้
            formattedText = processMessageText(text);
        } else {
            // User messages: escape all HTML
            // ข้อความผู้ใช้: escape HTML ทั้งหมด
            formattedText = escapeHtml(text).replace(/\n/g, '<br>');
        }

        // Create message container
        // สร้าง container ข้อความ
        const div = document.createElement('div');
        div.className = `message-item ${sender} ${isError ? 'error-message' : ''}`;

        // Format timestamp
        // จัดรูปแบบเวลา
        let time;
        if (customTime) {
            const dateObj = new Date(customTime);
            time = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                : escapeHtml(customTime);
        } else {
            time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        }

        // Build message HTML
        // สร้าง HTML ข้อความ
        const avatarHtml = sender === 'bot'
            ? '<div class="avatar rounded-circle bg-light border d-flex align-items-center justify-content-center overflow-hidden"><img src="image/bot_avatar.png" alt="Bot Avatar" class="w-100 h-100 object-fit-cover"></div>'
            : '';
        const name = sender === 'user' ? 'ฉัน' : 'ลาเต้';

        // Generate message ID if needed
        // สร้าง message ID ถ้าจำเป็น
        if (sender === 'bot' && !isError && !msgId) {
            msgId = `auto-${Date.now()}`;
        }

        // Build feedback buttons for bot messages
        // สร้างปุ่ม feedback สำหรับข้อความ bot
        let feedbackHtml = '';
        if (sender === 'bot' && !isError && msgId) {
            const safeMsgId = escapeHtml(msgId);
            const likeActive = existingFeedback === 'like' ? 'active' : '';
            const dislikeActive = existingFeedback === 'dislike' ? 'active' : '';
            feedbackHtml = `
                <div class="feedback-container">
                    <button class="feedback-btn ${likeActive}" onclick="sendFeedback('${safeMsgId}', 'like', this)" title="มีประโยชน์">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                        </svg>
                    </button>
                    <button class="feedback-btn ${dislikeActive}" onclick="sendFeedback('${safeMsgId}', 'dislike', this)" title="ไม่ค่อยมีประโยชน์">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                        </svg>
                    </button>
                </div>`;
        }



        // Set message HTML
        // ตั้งค่า HTML ข้อความ
        div.innerHTML = `
            <div class="message-content">
                ${avatarHtml}
                <div class="message-text-wrapper">
                    <div class="sender-name">${name}</div>
                    <div class="message-bubble ${sender === 'user' ? 'user-message' : 'bot-message'}">
                         ${formattedText}
                    </div>
                    <div class="timestamp" style="${sender === 'user' ? 'justify-content: flex-end;' : ''}"><span>${time}</span></div>
                    ${feedbackHtml}
                </div>
            </div>`;


        // Insert message into chat
        // แทรกข้อความในแชท
        if (typingIndicator && typingIndicator.parentNode === chatMessages) {
            chatMessages.insertBefore(div, typingIndicator);
        } else {
            chatMessages.appendChild(div);
        }
        chatMessages.scrollTo(0, chatMessages.scrollHeight);
    }


    // =========================================================================
    // Section 9: Action Handlers
    // ส่วนที่ 9: ฟังก์ชันจัดการ Action
    // =========================================================================

    /**
     * Handle pill button click from sidebar menu
     * จัดการการกดปุ่ม pill จาก sidebar menu
     * 
     * @param {string} text - Message text to send
     */
    function handlePillClick(text) {
        handleMenuClick(); // Close menu
        sendMessage(text);
    }

    /**
     * Open report form in new tab
     * เปิดฟอร์มแจ้งปัญหาในแท็บใหม่
     */
    function openReportForm() {
        handleMenuClick(); // Close menu
        window.open(
            'https://forms.office.com/pages/responsepage.aspx?id=y3yDDp4oxEWPHuKDu39iieadyG-NJuRElIqE1xFDbJhUM1YwTFk2NFgxSkFXMUkzQzdDVVhPVTNCUS4u&route=shorturl',
            '_blank'
        );
    }

    /**
     * Handle user logout
     * จัดการการออกจากระบบ
     */
    function handleLogout() {
        // Clear all timers
        // ล้าง timer ทั้งหมด
        clearTimeout(afkTimer);
        clearTimeout(backgroundTimer);
        clearTimeout(afkWarningTimer);
        clearInterval(afkCountdownInterval);

        // Clear session data
        // ล้างข้อมูล session
        setCookie('sessionId', '', -1);
        localStorage.removeItem(STORAGE_KEY_SUGGESTIONS);

        // Reload page
        // โหลดหน้าใหม่
        window.location.reload();
    }

    // =========================================================================
    // Section 10: Auto Logout Monitoring (AFK Detection)
    // ส่วนที่ 10: ระบบตรวจจับการไม่ใช้งาน (AFK)
    // =========================================================================

    /**
     * Start monitoring user activity for auto-logout
     * เริ่มตรวจสอบกิจกรรมผู้ใช้สำหรับ auto-logout
     */
    function startAutoLogoutMonitoring() {
        // Listen for user activity events
        // ฟังเหตุการณ์กิจกรรมผู้ใช้
        const activityEvents = ['mousemove', 'keypress', 'click', 'scroll', 'touchstart'];
        activityEvents.forEach(evt => {
            document.addEventListener(evt, onUserActivity);
        });

        // Start AFK timer
        // เริ่ม timer AFK
        resetAfkTimer();

        // Monitor tab visibility
        // ตรวจสอบการมองเห็นแท็บ
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    /**
     * Handle user activity - reset AFK timer if warning not shown
     * จัดการกิจกรรมผู้ใช้ - reset timer AFK ถ้ายังไม่แสดง warning
     */
    function onUserActivity() {
        // Only reset if warning popup is not showing
        // Reset เฉพาะเมื่อ popup warning ไม่ได้แสดงอยู่
        if (afkWarningPopup.classList.contains('d-none')) {
            resetAfkTimer();
        }
        // If popup is showing, user must click button to dismiss
        // ถ้า popup แสดงอยู่ ผู้ใช้ต้องกดปุ่มเพื่อปิด
    }

    /**
     * Reset AFK timer
     * Reset timer AFK
     */
    function resetAfkTimer() {
        // Clear existing timers
        // ล้าง timer ที่มีอยู่
        clearTimeout(afkTimer);
        clearTimeout(afkWarningTimer);
        clearInterval(afkCountdownInterval);

        // Only set timers if user is logged in
        // ตั้ง timer เฉพาะเมื่อผู้ใช้เข้าสู่ระบบแล้ว
        if (loginSection.classList.contains('d-none')) {
            // Set warning timer (shows 30 seconds before logout)
            // ตั้ง timer warning (แสดง 30 วินาทีก่อน logout)
            afkWarningTimer = setTimeout(showAfkWarning, AFK_LIMIT - AFK_WARNING_TIME);

            // Set logout timer
            // ตั้ง timer logout
            afkTimer = setTimeout(handleLogout, AFK_LIMIT);
        }
    }

    /**
     * Show AFK warning popup with countdown
     * แสดง popup เตือน AFK พร้อม countdown
     */
    function showAfkWarning() {
        // Don't show if not logged in
        // ไม่แสดงถ้ายังไม่เข้าสู่ระบบ
        if (!loginSection.classList.contains('d-none')) return;

        afkWarningPopup.classList.remove('d-none');

        // Start countdown
        // เริ่ม countdown
        let countdown = Math.floor(AFK_WARNING_TIME / 1000);
        afkCountdownEl.textContent = countdown;

        afkCountdownInterval = setInterval(() => {
            countdown--;
            afkCountdownEl.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(afkCountdownInterval);
            }
        }, 1000);
    }

    /**
     * Hide AFK warning popup
     * ซ่อน popup เตือน AFK
     */
    function hideAfkWarning() {
        afkWarningPopup.classList.add('d-none');
        clearInterval(afkCountdownInterval);
    }

    /**
     * Dismiss AFK warning and reset timer
     * ปิด warning AFK และ reset timer
     */
    function dismissAfkWarning() {
        hideAfkWarning();
        resetAfkTimer();
    }

    /**
     * Handle tab visibility change
     * จัดการการเปลี่ยนแปลงการมองเห็นแท็บ
     */
    function handleVisibilityChange() {
        if (document.hidden) {
            // Tab hidden - start background timer
            // แท็บถูกซ่อน - เริ่ม timer background
            backgroundTimer = setTimeout(handleLogout, BACKGROUND_LIMIT);
        } else {
            // Tab visible - clear background timer and reset AFK
            // แท็บมองเห็น - ล้าง timer background และ reset AFK
            clearTimeout(backgroundTimer);
            resetAfkTimer();
        }
    }

    // =========================================================================
    // Section 11: Event Listeners & Initialization
    // ส่วนที่ 11: Event Listeners และการเริ่มต้น
    // =========================================================================

    // Send button click
    // กดปุ่มส่ง
    sendBtn.addEventListener('click', () => sendMessage());

    // Enter key to send (Shift+Enter for new line)
    // กด Enter เพื่อส่ง (Shift+Enter สำหรับขึ้นบรรทัดใหม่)
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Form Submissions
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendMessage();
        });
    }

    /**
     * Initialize application on page load
     * เริ่มต้นแอปพลิเคชันเมื่อโหลดหน้า
     */
    window.onload = async () => {
        await loadConfig();
        checkInput();
        connectWebSocket();
        checkLoginStatus();
        typingIndicator.classList.add('d-none');
    };

    // =========================================================================
    // Section 12: Export Functions to Window (for HTML onclick handlers)
    // ส่วนที่ 12: Export ฟังก์ชันไปยัง Window (สำหรับ onclick ใน HTML)
    // =========================================================================

    // These functions are called from HTML onclick attributes
    // ฟังก์ชันเหล่านี้ถูกเรียกจาก onclick attributes ใน HTML
    window.handleLogin = handleLogin;
    window.handleLogout = handleLogout;
    window.handleMenuClick = handleMenuClick;
    window.handlePillClick = handlePillClick;
    window.openReportForm = openReportForm;
    window.sendFeedback = sendFeedback;
    window.sendMessage = sendMessage;
    window.dismissAfkWarning = dismissAfkWarning;
    window.autoExpandTextarea = autoExpandTextarea;


})(); // End of IIFE - DOM Clobbering Protection
