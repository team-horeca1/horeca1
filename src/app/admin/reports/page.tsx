'use client';

import React, { useState, useEffect } from 'react';
import { BarChart3, Download, Loader2, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FinanceSummaryStrip } from '@/components/features/finance/FinanceSummaryStrip';

interface OverviewData {
  period: string;
  summary: {
    totalGmv: number;
    platformRevenue: number;
    returnsRefunded: number;
    pendingSettlements: number;
  };
  salesByVendor: Array<{
    vendorName: string;
    orderCount: number;
    gross: number;
    platformFee: number;
    netVendor: number;
  }>;
  monthlyTrend: Array<{ name: string; gmv: number; fees: number }>;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function AdminReportsPage() {
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OverviewData | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/admin/reports?period=${period}`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setData(json.data); })
      .finally(() => setLoading(false));
  }, [period]);

  const exportCsv = (type: string) => {
    window.open(`/api/v1/admin/reports?type=${type}&period=${period}&format=csv`, '_blank');
  };

  return (
    <div className="space-y-6 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[clamp(1.25rem,2vw+0.75rem,1.75rem)] font-bold text-[#181725]">Platform Reports</h1>
          <p className="text-[12px] text-[#7C7C7C]">GMV, platform revenue, settlements, and returns — downloadable</p>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`min-h-12 min-w-12 px-4 rounded-full text-[13px] font-semibold ${period === p ? 'bg-primary text-white' : 'bg-white border border-[#EEEEEE] text-[#7C7C7C]'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#6B1D2E]" size={32} /></div>
      ) : data && (
        <>
          <FinanceSummaryStrip
            metrics={[
              { label: 'GMV delivered', value: inr(data.summary.totalGmv) },
              {
                label: 'Platform revenue',
                value: inr(data.summary.platformRevenue),
                accent: 'green',
                footnote: data.summary.totalGmv > 0 && data.summary.platformRevenue === 0
                  ? 'Fees accrue when COD/prepaid orders are delivered'
                  : undefined,
              },
              { label: 'Returns processed', value: String(data.summary.returnsRefunded) },
              { label: 'Pending payouts', value: inr(data.summary.pendingSettlements), accent: 'amber' },
            ]}
          />

          {data.summary.totalGmv > 0 && data.summary.platformRevenue === 0 && (
            <p className="text-[12px] text-[#7C7C7C]">
              GMV includes all delivered orders; platform fees only apply to COD and prepaid orders after delivery settlement.
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { type: 'sales_by_vendor', label: 'Sales by vendor', desc: 'Gross, fees, net per vendor' },
              { type: 'settlements', label: 'Settlements', desc: 'Payout batches and status' },
              { type: 'returns', label: 'Returns summary', desc: 'Refund requests and amounts' },
            ].map((card) => (
              <button
                key={card.type}
                type="button"
                onClick={() => exportCsv(card.type)}
                className="text-left bg-white rounded-[14px] border border-[#EEEEEE] p-5 hover:border-[#6B1D2E]/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <BarChart3 size={20} className="text-[#6B1D2E]" />
                  <Download size={16} className="text-[#7C7C7C]" />
                </div>
                <p className="text-[14px] font-bold text-[#181725]">{card.label}</p>
                <p className="text-[11px] text-[#AEAEAE] mt-1">{card.desc}</p>
              </button>
            ))}
          </div>

          {data.monthlyTrend.length > 0 ? (
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} className="text-[#6B1D2E]" />
                <p className="text-[14px] font-bold">GMV & platform fees trend</p>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => inr(Number(v ?? 0))} />
                  <Area type="monotone" dataKey="gmv" stroke="#6B1D2E" fill="#F8E8EC" name="GMV" />
                  <Area type="monotone" dataKey="fees" stroke="#8B5CF6" fill="#F3E8FF" name="Platform fees" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] p-10 text-center">
              <TrendingUp size={36} className="text-[#E5E7EB] mx-auto mb-3" />
              <p className="text-[13px] font-bold text-[#AEAEAE]">No trend data for this period — deliver orders to see GMV and fees</p>
            </div>
          )}

          <div className="bg-white rounded-[14px] border border-[#EEEEEE] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F5F5F5]">
              <p className="text-[14px] font-bold">Top vendors by GMV</p>
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-[#FAFAFA]">
                  <th className="text-left px-4 py-3 font-semibold text-[#7C7C7C]">Vendor</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Orders</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Gross</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Platform fee</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#7C7C7C]">Vendor net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5]">
                {data.salesByVendor.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-[13px] font-bold text-[#AEAEAE]">
                      No vendors with delivered orders in this period
                    </td>
                  </tr>
                ) : data.salesByVendor.map((v) => (
                  <tr key={v.vendorName} className="hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3 font-semibold">{v.vendorName}</td>
                    <td className="px-4 py-3 text-right">{v.orderCount}</td>
                    <td className="px-4 py-3 text-right">{inr(v.gross)}</td>
                    <td className="px-4 py-3 text-right text-[#6B1D2E]">{inr(v.platformFee)}</td>
                    <td className="px-4 py-3 text-right">{inr(v.netVendor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
