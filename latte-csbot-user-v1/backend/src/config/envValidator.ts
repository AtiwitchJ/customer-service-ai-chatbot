/**
 * Environment Variables Validator
 * ตรวจสอบ env vars ที่จำเป็นตอน startup
 */

const requiredEnvVars = [
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'REDIS_CHAT_DB',
  'REDIS_VERIFY_DB',
  'REDIS_QUEUE_DB',
  'AI_AGENT_QUEUE_NAME',
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'OLLAMA_BASE_URL',
  'OLLAMA_CHAT_MODEL',
  'OLLAMA_EMBED_MODEL',
  'AGENT_WEBHOOK_URL',
  'API_BASE',
  'INTERNAL_BACKEND_URL',
  'MS_FORMS_REPORT_URL',
];

const optionalEnvVars: Array<{ name: string; default: string }> = [
  { name: 'PORT', default: '3001' },
  { name: 'NODE_ENV', default: 'production' },
  { name: 'CHAT_TTL_SECONDS', default: '600' },
  { name: 'MAX_LOGIN_ATTEMPTS', default: '5' },
  { name: 'BLOCK_DURATION_MS', default: '300000' },
  { name: 'RATE_LIMIT_WINDOW_MS', default: '300000' },
  { name: 'RATE_LIMIT_MAX_REQUESTS', default: '500' },
  { name: 'CHAT_RATE_LIMIT_WINDOW_MS', default: '60000' },
  { name: 'CHAT_RATE_LIMIT_MAX', default: '60' },
  { name: 'REDIS_SESSION_TTL', default: '86400' },
  { name: 'REDIS_CHAT_HISTORY_LIMIT', default: '100' },
  { name: 'REDIS_CHAT_HISTORY_EXPIRE', default: '3600' },
  { name: 'REDIS_MEMORY_DB', default: '2' },
  { name: 'REDIS_COOLDOWN_DB', default: '4' },
  { name: 'AI_AGENT_KEEP_ALIVE', default: '30m' },
  { name: 'MS_FORM_QUEUE_NAME', default: 'ms_form' },
  { name: 'RESET_PASSWORD_QUEUE_NAME', default: 'reset_password' },
  { name: 'AUTH_BYPASS_MODE', default: 'true' },
  { name: 'WORKER_ERROR_NOTIFICATION', default: 'true' },
  { name: 'LOG_LEVEL', default: 'info' },
  { name: 'ENABLE_DEBUG_LOGS', default: 'false' },
];

export function validateEnv(): void {
  const missing: string[] = [];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  for (const { name, default: defaultValue } of optionalEnvVars) {
    if (!process.env[name]) {
      process.env[name] = defaultValue;
      console.log(`[ENV] Using default value for ${name}: ${defaultValue}`);
    }
  }

  if (missing.length > 0) {
    const errorMsg = `❌ Missing required environment variables: ${missing.join(', ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  console.log('✅ Environment variables validated');
}

export function logEnvStatus(): void {
  const sensitiveKeys = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'API'];

  console.log('\n📋 Environment Configuration:');
  console.log('─'.repeat(40));

  const allEnvVars = [...requiredEnvVars, ...optionalEnvVars.map((e) => e.name)];

  for (const envVar of allEnvVars) {
    const value = process.env[envVar];
    const isSensitive = sensitiveKeys.some((key) => envVar.toUpperCase().includes(key));
    const displayValue = isSensitive ? '***' : (value || 'not set');
    console.log(`   ${envVar}: ${displayValue}`);
  }

  console.log('─'.repeat(40) + '\n');
}
