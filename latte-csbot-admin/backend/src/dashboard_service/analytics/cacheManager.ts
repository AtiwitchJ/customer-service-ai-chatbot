/**
 * CACHE MANAGER
 * =============
 * Simple cache management with auto-updates / จัดการ cache อย่างเรียบง่ายพร้อม auto-update
 */

import { UPDATE_INTERVAL_MS, STARTUP_DELAY_MS, updateAllCaches } from './analyticsService';

function initializeCacheManager(): void {
  setTimeout(() => {
    updateAllCaches();

    setInterval(() => {
      updateAllCaches();
    }, UPDATE_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export { initializeCacheManager };
