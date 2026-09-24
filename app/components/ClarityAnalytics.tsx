'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

export const TEST_DEVICE_STORAGE_KEY = 'cityhost_test_device';
export const TEST_DEVICE_COOKIE_NAME = 'cityhost_test_device';

/**
 * Microsoft Clarity session recording and heatmaps analytics.
 * Protects staff privacy by excluding all /admin routes.
 * Excludes developer/owner test devices persistently via first-party cookie or localStorage.
 */
export default function ClarityAnalytics() {
  const pathname = usePathname();
  const projectId =
    process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || 'ylvzj6nbmx';

  const [shouldLoadClarity, setShouldLoadClarity] = useState<boolean>(false);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;

      const urlParams = new URLSearchParams(window.location.search);
      const testParam = urlParams.get('test_device');

      // 1. One-time activation: visit any page with ?test_device=1 or ?test_device=true
      if (testParam === '1' || testParam === 'true') {
        localStorage.setItem(TEST_DEVICE_STORAGE_KEY, '1');
        document.cookie = `${TEST_DEVICE_COOKIE_NAME}=1; path=/; max-age=315360000; SameSite=Lax`;
        urlParams.delete('test_device');
        const newQuery = urlParams.toString();
        const newUrl =
          window.location.pathname +
          (newQuery ? `?${newQuery}` : '') +
          window.location.hash;
        window.history.replaceState(null, '', newUrl);
        console.log('[CityHost] Test device mode ACTIVATED. Microsoft Clarity is disabled on this device.');
        setShouldLoadClarity(false);
        return;
      }

      // 2. Deactivation option (if ever needed): ?test_device=0 or ?test_device=disable
      if (testParam === '0' || testParam === 'false' || testParam === 'disable') {
        localStorage.removeItem(TEST_DEVICE_STORAGE_KEY);
        document.cookie = `${TEST_DEVICE_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
        urlParams.delete('test_device');
        const newQuery = urlParams.toString();
        const newUrl =
          window.location.pathname +
          (newQuery ? `?${newQuery}` : '') +
          window.location.hash;
        window.history.replaceState(null, '', newUrl);
        console.log('[CityHost] Test device mode DEACTIVATED. Microsoft Clarity enabled.');
        setShouldLoadClarity(true);
        return;
      }

      // 3. Persistent check across visits, navigation, and browser restarts:
      const hasStorageFlag = localStorage.getItem(TEST_DEVICE_STORAGE_KEY) === '1';
      const hasCookieFlag = document.cookie
        .split(';')
        .some((c) => c.trim().startsWith(`${TEST_DEVICE_COOKIE_NAME}=1`));

      if (hasStorageFlag || hasCookieFlag) {
        // Ensure both storage and cookie are in sync
        if (!hasStorageFlag) localStorage.setItem(TEST_DEVICE_STORAGE_KEY, '1');
        if (!hasCookieFlag) {
          document.cookie = `${TEST_DEVICE_COOKIE_NAME}=1; path=/; max-age=315360000; SameSite=Lax`;
        }
        setShouldLoadClarity(false);
        return;
      }

      // Normal visitor: initialize Clarity
      setShouldLoadClarity(true);
    } catch {
      // In case of restricted environment, load normally
      setShouldLoadClarity(true);
    }
  }, []);

  // Skip if no project id configured, if user is in admin, or if this is a marked test device
  if (!projectId || (pathname && pathname.startsWith('/admin')) || !shouldLoadClarity) {
    return null;
  }

  return (
    <Script id="microsoft-clarity" strategy="afterInteractive">
      {`
        (function(c,l,a,r,i,t,y){
            if (typeof window !== 'undefined') {
              try {
                if (window.localStorage && window.localStorage.getItem('${TEST_DEVICE_STORAGE_KEY}') === '1') return;
                if (document.cookie && document.cookie.indexOf('${TEST_DEVICE_COOKIE_NAME}=1') !== -1) return;
              } catch(e) {}
            }
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "${projectId}");
      `}
    </Script>
  );
}
