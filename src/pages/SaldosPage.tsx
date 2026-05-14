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
    setSelectedGroupId(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set('group', id);
      } else {
        url.searchParams.delete('group');
      }
      window.history.replaceState({}, '', url.pathname + url.search);
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
