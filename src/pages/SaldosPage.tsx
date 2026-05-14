import { useState } from 'react';
import { useSaldamosAuth } from '@/contexts/SaldamosAuthContext';
import AuthWall from '@/components/saldos/AuthWall';
import GroupsList from '@/components/saldos/GroupsList';
import GroupDetail from '@/components/saldos/GroupDetail';
import { Loader2 } from 'lucide-react';

interface Props {
  pendingImportText: string | null;
  onClearPendingImport: () => void;
  billData?: string | null;
}

export default function SaldosPage({ pendingImportText, onClearPendingImport, billData }: Props) {
  const { user, loading } = useSaldamosAuth();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('group');
    }
    return null;
  });

  // Handle hardware back button
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      // If we are in detail view, go back to list
      if (selectedGroupId) {
        setSelectedGroupId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedGroupId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <AuthWall />;
  }

  const handleSelectGroup = (id: string | null) => {
    const prevId = selectedGroupId;
    setSelectedGroupId(id);
    
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set('group', id);
        // Only push state if we are moving FROM list TO group
        if (!prevId) window.history.pushState({ group: id }, '', url.pathname + url.search);
        else window.history.replaceState({ group: id }, '', url.pathname + url.search);
      } else {
        url.searchParams.delete('group');
        // If we had a group, we already "popped" or we are manually closing
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    }
  };

  if (selectedGroupId) {
    return (
      <GroupDetail 
        groupId={selectedGroupId} 
        onBack={() => handleSelectGroup(null)} 
        pendingImportText={pendingImportText}
        onClearPendingImport={onClearPendingImport}
        billData={billData}
      />
    );
  }

  return <GroupsList onSelectGroup={handleSelectGroup} />;
}
