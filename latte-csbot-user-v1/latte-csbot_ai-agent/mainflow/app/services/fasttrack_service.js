/**
 * FastTrack Service
 * =================
 * ตรวจสอบและจัดการคำสั่งด่วน (Fast Path) ที่ไม่ต้องผ่าน AI
 * 
 * Supported Fast Tracks:
 * - Reset Password: ผู้ใช้ยืนยันการรีเซ็ตรหัสผ่าน
 * - MS Form: ผู้ใช้ขอเปิดแบบฟอร์มแจ้งปัญหา
 */

// Keywords สำหรับตรวจสอบการยืนยัน/ปฏิเสธ
const USER_CONFIRM_KEYWORDS = [
    "ต้องการ", "ใช่", "ตกลง", "ยืนยัน", "ทำเลย", "ok", "ครับ", "ค่ะ", "จัดไป", "reset", "เอา"
];

const NEGATIVE_KEYWORDS = [
    "ไม่", "อย่า", "no", "cancel", "ยกเลิก", "ติดต่อ", "สอบถาม", "อื่นๆ", "ไม่ใช่", "ยังก่อน"
];

// Keywords สำหรับ Fast Track: Reset Password
const AI_ASKED_RESET_KEYWORDS = [
    "ต้องการให้เราส่งคำสั่งรีเซ็ตรหัสผ่าน",
    "ต้องการรีเซ็ตรหัสผ่าน",
    "ส่งลิงก์รีเซ็ต",
    "รีเซ็ตรหัสผ่านหรือไม่",
    "ให้คุณตอนนี้เลยหรือไม่"
];

// Keywords สำหรับ Fast Track: MS Form
const MS_FORM_DIRECT_KEYWORDS = [
    "ขอกรอกฟอร์ม", "ขอแบบฟอร์ม", "ขอลิงก์ฟอร์ม", "เปิดฟอร์ม", "ใบคำร้อง"
];

const AI_ASKED_MS_FORM_KEYWORDS = [
    "ต้องการแจ้งปัญหาหรือไม่",
    "กรอกแบบฟอร์มหรือไม่",
    "ให้เปิดแบบฟอร์ม",
    "microsoft form",
    "ms form",
    "ร้องเรียน",
    "เปิดสิทธิ์",
    "แจ้งรายละเอียด",
    "ส่งภาพหน้าจอ",
    "แจ้งชื่อหลักสูตร"
];

const STRONG_CONFIRM_KEYWORDS = ["ต้องการ", "ฉันต้องการ", "เอา", "ทำเลย"];

/**
 * ตรวจสอบว่าผู้ใช้ยืนยัน (confirm) หรือไม่
 * @param {string} userText - ข้อความจากผู้ใช้
 * @returns {boolean}
 */
function isConfirmed(userText) {
    const lowerText = userText.toLowerCase();
    return USER_CONFIRM_KEYWORDS.some(kw => lowerText.includes(kw));
}

/**
 * ตรวจสอบว่าผู้ใช้ปฏิเสธ (negative) หรือไม่
 * @param {string} userText - ข้อความจากผู้ใช้
 * @returns {boolean}
 */
function isNegative(userText) {
    const lowerText = userText.toLowerCase();
    return NEGATIVE_KEYWORDS.some(kw => lowerText.includes(kw));
}

/**
 * ตรวจสอบว่าผู้ใช้ยืนยันอย่างแรง (exact match)
 * @param {string} userText - ข้อความจากผู้ใช้
 * @returns {boolean}
 */
function isStrongConfirmed(userText) {
    const lowerText = userText.toLowerCase();
    return STRONG_CONFIRM_KEYWORDS.some(kw => lowerText === kw);
}

/**
 * Fast Track: Reset Password
 * ตรวจสอบว่าผู้ใช้ยืนยันการรีเซ็ตรหัสผ่านหลังจาก AI ถาม
 * 
 * @param {string} userText - ข้อความจากผู้ใช้
 * @param {string} history - ประวัติแชท
 * @returns {object|null} - ถ้าเป็น Fast Track จะคืนค่า response object, ถ้าไม่ใช่จะคืน null
 */
function checkResetPasswordFastTrack(userText, history) {
    if (isNegative(userText)) return null;
    if (!isConfirmed(userText)) return null;

    const hasAiAskedReset = AI_ASKED_RESET_KEYWORDS.some(kw => history.includes(kw));
    
    if (!hasAiAskedReset) return null;

    console.log("[FastTrack] User confirmed Reset Password");
    
    return {
        thinking_process: "FastTrack: User confirmed reset password",
        answers: ["รับทราบค่ะ ระบบกำลังส่งคำสั่งรีเซ็ตรหัสผ่านให้คุณสักครู่นะคะ"],
        question: "",
        action: "reset_password",
        image_urls: []
    };
}

/**
 * Fast Track: MS Form (Microsoft Form)
 * ตรวจสอบว่าผู้ใช้ขอเปิดแบบฟอร์มแจ้งปัญหา
 * 
 * @param {string} userText - ข้อความจากผู้ใช้
 * @param {string} history - ประวัติแชท
 * @returns {object|null} - ถ้าเป็น Fast Track จะคืนค่า response object, ถ้าไม่ใช่จะคืน null
 */
function checkMsFormFastTrack(userText, history) {
    if (isNegative(userText)) return null;

    const lowerText = userText.toLowerCase();
    
    // กรณี 1: ขอฟอร์มตรงๆ (ไม่ต้องมีประวัติ)
    const isDirectRequest = MS_FORM_DIRECT_KEYWORDS.some(kw => lowerText.includes(kw));
    
    // กรณี 2: AI เคยถาม และผู้ใช้ยืนยัน
    const hasAiAskedMs = AI_ASKED_MS_FORM_KEYWORDS.some(kw => history.includes(kw));
    const isConfirmedUser = isConfirmed(userText);
    const isStrongConfirm = isStrongConfirmed(userText);

    const shouldTrigger = isDirectRequest || 
                          (hasAiAskedMs && isConfirmedUser) || 
                          (hasAiAskedMs && isStrongConfirm);

    if (!shouldTrigger) return null;

    console.log("[FastTrack] User requested MS Form");
    
    return {
        thinking_process: "FastTrack: User requested Microsoft Form",
        answers: ["รับทราบค่ะ ระบบกำลังเปิดแบบฟอร์มให้ท่านสักครู่นะคะ"],
        question: "",
        action: "ms_form",
        image_urls: []
    };
}

/**
 * ตรวจสอบ Fast Track ทั้งหมด
 * เรียงลำดับความสำคัญ: Reset Password → MS Form
 * 
 * @param {string} userText - ข้อความจากผู้ใช้
 * @param {string} history - ประวัติแชท
 * @returns {object|null} - ถ้าเป็น Fast Track จะคืนค่า response object, ถ้าไม่ใช่จะคืน null
 */
function checkFastTrack(userText, history) {
    // Priority 1: Reset Password
    const resetPasswordResult = checkResetPasswordFastTrack(userText, history);
    if (resetPasswordResult) return resetPasswordResult;

    // Priority 2: MS Form
    const msFormResult = checkMsFormFastTrack(userText, history);
    if (msFormResult) return msFormResult;

    // ไม่ใช่ Fast Track
    return null;
}

module.exports = {
    checkFastTrack,
    checkResetPasswordFastTrack,
    checkMsFormFastTrack,
    isConfirmed,
    isNegative,
    isStrongConfirmed
};
