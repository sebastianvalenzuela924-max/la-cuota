import { useState, useEffect } from 'react';
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

  // Handle hardware back button and URL sync
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const groupId = params.get('group');
      setSelectedGroupId(groupId);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
    if (id === selectedGroupId) return;
    
    setSelectedGroupId(id);
    
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set('group', id);
        // Only push if manually selecting, don't push if already there
        window.history.pushState({ group: id }, '', url.pathname + url.search);
      } else {
        url.searchParams.delete('group');
        // When going back to list, use replace to not pollute history if it was just a "back" action
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    }
  };

  const handleManualBack = () => {
    // Always update React state immediately (1 press = 1 action)
    // Then clean the URL to match — no need to wait for popstate
    setSelectedGroupId(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('group');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  };

  if (selectedGroupId) {
    return (
      <GroupDetail 
        groupId={selectedGroupId} 
        onBack={handleManualBack} 
        pendingImportText={pendingImportText}
        onClearPendingImport={onClearPendingImport}
        billData={billData}
      />
    );
  }

  return <GroupsList onSelectGroup={handleSelectGroup} />;
}
