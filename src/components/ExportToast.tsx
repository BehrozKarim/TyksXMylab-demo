import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

export function ExportToast() {
  const [notice, setNotice] = useState<{ message: string } | null>(null);
  useEffect(() => {
    const exported = (event: Event) =>
      setNotice({ message: (event as CustomEvent<string>).detail });
    window.addEventListener('ward-evidence-exported', exported);
    return () => window.removeEventListener('ward-evidence-exported', exported);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <div className={notice ? 'toast' : 'sr-only'} role="status" aria-live="polite">
      {notice && (
        <>
          <Download size={16} />
          {notice.message}
        </>
      )}
    </div>
  );
}
