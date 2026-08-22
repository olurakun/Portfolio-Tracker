"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import ShareView from "../../components/ShareView";
import type { ShareSnapshot } from "../../../lib/shares";

type Loaded =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; title: string | null; snapshot: ShareSnapshot; updatedAt: string };

/**
 * Herkese açık paylaşım sayfası. Giriş GEREKTİRMEZ — public_portfolio_shares
 * görünümü `anon` rolüne açık (bkz. proje köküne eklenen SQL). Bu görünüm
 * user_id'yi hiç döndürmez; paylaşımı kimin yaptığı hiçbir şekilde sızmaz.
 *
 * AuthGate'in DIŞINDA bir route olduğu için app/page.tsx'in oturum akışına
 * hiç girmez.
 */
export default function PublicSharePage() {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<Loaded>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('public_portfolio_shares')
        .select('title, config, snapshot, refreshed_at')
        .eq('id', params.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) { setState({ status: 'error' }); return; }
      if (!data) { setState({ status: 'not-found' }); return; }

      setState({
        status: 'ready',
        title: data.title,
        snapshot: data.snapshot as ShareSnapshot,
        updatedAt: data.refreshed_at,
      });
    })();
    return () => { cancelled = true; };
  }, [params.id]);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-500 text-sm">
        Yükleniyor...
      </div>
    );
  }

  if (state.status === 'not-found') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-lg font-bold text-white mb-2">Paylaşım bulunamadı</div>
          <p className="text-sm text-gray-500">
            Bu bağlantı geçersiz olabilir ya da sahibi tarafından kaldırılmış olabilir.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-500 text-sm">
        Bir şeyler ters gitti, sayfayı yenilemeyi dene.
      </div>
    );
  }

  return <ShareView title={state.title} snapshot={state.snapshot} updatedAt={state.updatedAt} />;
}
