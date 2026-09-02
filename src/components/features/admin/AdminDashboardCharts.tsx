'use client';

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Wallet } from 'lucide-react';

type MonthRow = { month: string; orders: number; revenue: number };

const formatYAxis = (value: number) => {
  if (value === 0) return '0';
  if (value >= 100000) {
    return `${Math.floor(value / 100000)},${String(Math.floor((value % 100000) / 1000)).padStart(2, '0')},000`;
  }
  if (value >= 1000) return `${(value / 1000).toFixed(0)},000`;
  return value.toString();
};

const RoundedBar = (props: Record<string, number>) => {
  const { x, y, width, height } = props;
  const radius = 5;
  if (height <= 0) return null;
  return (
    <path
      d={`
                M${x},${y + height}
                L${x},${y + radius}
                Q${x},${y} ${x + radius},${y}
                L${x + width - radius},${y}
                Q${x + width},${y} ${x + width},${y + radius}
                L${x + width},${y + height}
                Z
            `}
      fill="url(#barGradient)"
    />
  );
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-lg px-4 py-3">
        <p className="text-[12px] text-[#7C7C7C] font-medium">{label}</p>
        <p className="text-[16px] font-bold text-[#181725]">₹ {payload[0].value.toLocaleString('en-IN')}</p>
      </div>
    );
  }
  return null;
};

export default function AdminDashboardCharts({ monthlyData }: { monthlyData: MonthRow[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white p-4 lg:p-8 rounded-[16px] border border-divider shadow-sm">
        <h3 className="text-[16px] lg:text-[18px] font-bold text-[#111827] mb-4 lg:mb-6">Orders Overview</h3>
        <div className="h-[220px] lg:h-[340px] w-full">
          {monthlyData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <TrendingUp size={40} className="mb-3 opacity-30" />
              <p className="text-[14px] font-medium">No order data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={monthlyData.map((d) => ({ month: d.month, value: d.orders }))}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6B1D2E" />
                    <stop offset="55%" stopColor="#F8E8EC" />
                    <stop offset="100%" stopColor="#FFFFFF" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#C8C8C8" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#7C7C7C', fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#7C7C7C', fontWeight: 500 }}
                  width={40}
                />
                <Tooltip formatter={(val) => [val, 'Orders']} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="none"
                  strokeWidth={0}
                  fill="url(#salesGradient)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#fff', stroke: '#6B1D2E', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white p-4 lg:p-8 rounded-[16px] border border-divider shadow-sm">
        <h3 className="text-[16px] lg:text-[18px] font-bold text-[#111827] mb-4 lg:mb-6">Monthly Revenue</h3>
        <div className="h-[220px] lg:h-[340px] w-full">
          {monthlyData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <Wallet size={40} className="mb-3 opacity-30" />
              <p className="text-[14px] font-medium">No revenue data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyData.map((d) => ({ month: d.month, value: d.revenue }))}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6B1D2E" stopOpacity={1} />
                    <stop offset="100%" stopColor="#4A141F" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#C8C8C8" vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#7C7C7C', fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#7C7C7C', fontWeight: 500 }}
                  tickFormatter={formatYAxis}
                  width={65}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" barSize={27} shape={<RoundedBar />} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
