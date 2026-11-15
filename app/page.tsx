import MaintenanceView from '@/components/MaintenanceView';
import HomeClient from '@/app/HomeClient';
import { MAINTENANCE_CONFIG } from '@/config/maintenance';
import { getStealthConfig } from '@/lib/stealth-router';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const stealth = await getStealthConfig().catch(() => null);
  const maintenanceEnabled = Boolean(MAINTENANCE_CONFIG.enabled || stealth?.maintenanceEnabled);

  if (maintenanceEnabled) {
    return (
      <MaintenanceView
        title={stealth?.maintenanceTitle || MAINTENANCE_CONFIG.title}
        message={stealth?.maintenanceMessage || MAINTENANCE_CONFIG.message}
      />
    );
  }

  return <HomeClient />;
}
