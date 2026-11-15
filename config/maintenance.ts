/**
 * Maintenance Mode Configuration
 * 
 * To ENABLE maintenance mode: set `enabled: true`
 * To DISABLE maintenance mode (back to normal): set `enabled: false`
 */
export const MAINTENANCE_CONFIG = {
  enabled: false,
  title: 'City Host travel site is under maintenance.',
  message: 'It will be solved as soon as possible, our IT team is working on it.',
  // Keep admin panel accessible for staff if needed (/admin)
  allowAdmin: true,
};
