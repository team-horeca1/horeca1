'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, ScrollText } from 'lucide-react';

interface AuditLogRow {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  at: string;
}

export default function AdminAuditLogsPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);

  useEffect(() => {
    fetch('/api/v1/admin/audit-logs?limit=100')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setLogs(json.data as AuditLogRow[]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-[clamp(1rem,2.5vw,2rem)] space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-[10px] bg-[#F3F4F6] flex items-center justify-center">
          <ScrollText size={20} className="text-[#374151]" />
        </div>
        <div>
          <h1 className="text-[clamp(1.25rem,2vw+0.75rem,1.75rem)] font-bold text-[#181725]">Audit Logs</h1>
          <p className="text-[12px] text-[#7C7C7C]">Platform admin actions — who changed what and when</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-[#299E60]" size={32} />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-[14px] p-10 text-center text-[#7C7C7C] text-[14px]">
          No audit log entries yet.
        </div>
      ) : (
        <div className="bg-white border border-[#EEEEEE] rounded-[14px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#F8F9FB] text-[#7C7C7C] uppercase text-[11px] tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-bold">When</th>
                  <th className="px-4 py-3 font-bold">Action</th>
                  <th className="px-4 py-3 font-bold">Entity</th>
                  <th className="px-4 py-3 font-bold">Actor</th>
                  <th className="px-4 py-3 font-bold">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3 whitespace-nowrap text-[#7C7C7C]">
                      {new Date(log.at).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#181725]">{log.action}</td>
                    <td className="px-4 py-3 text-[#181725]">
                      {log.entity}
                      {log.entityId ? <span className="text-[#AEAEAE]"> · {log.entityId.slice(0, 8)}…</span> : null}
                    </td>
                    <td className="px-4 py-3 text-[#7C7C7C]">
                      {log.actorRole ?? '—'}
                      {log.actorId ? <span className="block text-[11px]">{log.actorId.slice(0, 8)}…</span> : null}
                    </td>
                    <td className="px-4 py-3 text-[#7C7C7C]">{log.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
