import { Contract } from "../types";
import { formatWon } from "../utils";
import { Wallet, CreditCard, Clock, CalendarDays, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";

interface DashboardProps {
  contracts: Contract[];
  onOpenContract: (contract: Contract) => void;
}

export default function Dashboard({ contracts, onOpenContract }: DashboardProps) {
  // Calculations
  const totalAmount = contracts.reduce((sum, c) => (c.status !== "취소" ? sum + c.total_amount : sum), 0);
  const paidAmount = contracts.reduce((sum, c) => (c.status !== "취소" ? sum + c.paid_amount : sum), 0);
  const totalDiscount = contracts.reduce((sum, c) => (c.status !== "취소" ? sum + (c.partner_discount_total || 0) : sum), 0);
  const balanceAmount = Math.max(0, totalAmount - paidAmount - totalDiscount);
  // payment progress includes paid amount + discount credits applied to original amount
  const payPercentage = totalAmount > 0 ? Math.min(100, Math.round(((paidAmount + totalDiscount) / totalAmount) * 100)) : 0;

  // Balance due schedules: sort only non-complete, non-canceled contracts with balance dates
  const rawToday = new Date();
  rawToday.setHours(0, 0, 0, 0);

  const getDDay = (dateStr: string) => {
    if (!dateStr) return null;
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);
    const diffTime = targetDate.getTime() - rawToday.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const activeSchedules = contracts
    .filter((c) => c.status !== "취소" && c.status !== "잔금완료" && c.balance_due_date && (c.total_amount - c.paid_amount - (c.partner_discount_total || 0)) > 0)
    .map((c) => {
      const days = getDDay(c.balance_due_date);
      return { contract: c, days };
    })
    .sort((a, b) => {
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return a.days - b.days;
    });

  const getDDayBadge = (days: number | null) => {
    if (days === null) return { text: "일정 없음", style: "bg-slate-100 text-slate-500" };
    if (days < 0) return { text: `경과 ${Math.abs(days)}일`, style: "bg-slate-100 text-neutral-600 border border-slate-200" };
    if (days === 0) return { text: "D-Day", style: "bg-rose-100 text-rose-600 font-bold border border-rose-200 animate-pulse" };
    if (days <= 7) return { text: `D-${days}`, style: "bg-rose-100 text-rose-600 font-bold border border-rose-200" };
    if (days <= 30) return { text: `D-${days}`, style: "bg-amber-100 text-amber-700 font-semibold border border-amber-200" };
    return { text: `D-${days}`, style: "bg-emerald-100 text-emerald-700 font-medium border border-emerald-200" };
  };

  return (
    <div id="dashboard-container" className="flex flex-col gap-5">
      {/* 1. Header Ring section */}
      <div className="flex justify-between items-center bg-gradient-to-br from-white via-white to-[#FBEAF0]/30 p-5 rounded-3xl border border-pink-100/60 shadow-sm relative overflow-hidden">
        <div className="z-10">
          <span className="text-xs font-bold text-[#D4537E] tracking-wider uppercase bg-[#FBEAF0] px-2.5 py-1 rounded-full">우리 웨딩 준비 상태</span>
          <h2 className="text-xl font-extrabold text-slate-900 mt-2.5">
            잔금 납입 진행률
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">총 계약 중에서 {payPercentage}% 완료했어요</p>
        </div>
        <div className="relative w-18 h-18 flex items-center justify-center z-10 bg-white rounded-2xl p-1 shadow-sm border border-pink-100/40">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="32"
              cy="32"
              r="26"
              className="text-slate-100"
              strokeWidth="5"
              stroke="currentColor"
              fill="transparent"
            />
            <circle
              cx="32"
              cy="32"
              r="26"
              className="text-[#D4537E] transition-all duration-1000 ease-out"
              strokeWidth="5"
              strokeDasharray={2 * Math.PI * 26}
              strokeDashoffset={2 * Math.PI * 26 * (1 - payPercentage / 100)}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
            />
          </svg>
          <span id="pct-indicator" className="absolute text-xs font-black text-slate-800">{payPercentage}%</span>
        </div>
        {/* Subtle decorative background gradient */}
        <div className="absolute right-0 bottom-0 w-24 h-24 bg-[#FBEAF0] rounded-full filter blur-xl opacity-60 -mr-6 -mb-6"></div>
      </div>

      {/* 2. Three core amount items */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Total contract amount card */}
        <div className="bg-white px-5 py-4.5 rounded-3xl border border-slate-100/80 shadow-xs flex items-center gap-4 hover:shadow-sm transition-all">
          <div className="w-11 h-11 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-500 border border-slate-100/50">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400">총 약정 계약금액</span>
            <div id="dashboard-total-amount" className="text-lg font-extrabold text-slate-800 tracking-tight mt-0.5">
              {formatWon(totalAmount)}
            </div>
          </div>
        </div>

        {/* Paid amount card */}
        <div className="bg-white px-5 py-4.5 rounded-3xl border border-slate-100/80 shadow-xs flex items-center gap-4 hover:shadow-sm transition-all">
          <div className="w-11 h-11 rounded-2xl bg-[#EAF3DE] flex items-center justify-center text-[#558B2F] border border-[#EAF3DE]/80">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400">기납입 금액</span>
            <div id="dashboard-paid-amount" className="text-lg font-extrabold text-slate-800 tracking-tight mt-0.5">
              {formatWon(paidAmount)}
            </div>
          </div>
        </div>

        {/* Balance amount card (accent highlight) */}
        <div className="bg-gradient-to-r from-[#FBEAF0] to-[#FBEAF0]/60 px-5 py-4.5 rounded-3xl border border-[#ED93B1]/30 shadow-xs flex items-center gap-4 hover:shadow-sm transition-all">
          <div className="w-11 h-11 rounded-2xl bg-[#D4537E]/10 flex items-center justify-center text-[#D4537E] border border-[#D4537E]/10">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-[#D4537E]">남은 잔금 총액</span>
            <div id="dashboard-balance-amount" className="text-lg font-black text-[#D4537E] tracking-tight mt-0.5">
              {formatWon(balanceAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Balance dues timeline */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-900">잔금 납부 일정</h3>
        </div>

        {activeSchedules.length === 0 ? (
          <div className="text-center py-8 flex flex-col items-center gap-1.5">
            <p className="text-xs text-slate-400 font-medium">대기 중인 잔금 일정이 없습니다.</p>
            <span className="text-[11px] text-slate-300">모든 잔금을 무사히 납부했거나 준비를 완료했습니다.</span>
          </div>
        ) : (
          <div id="balance-schedules-list" className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {activeSchedules.map(({ contract, days }, idx) => {
               const badge = getDDayBadge(days);
               const remainingVal = Math.max(0, contract.total_amount - contract.paid_amount - (contract.partner_discount_total || 0));
              
              // Custom date parsing for calendar display
              let calMonth = "DUE";
              let calDay = "•";
              if (contract.balance_due_date) {
                const parts = contract.balance_due_date.split("-");
                if (parts.length === 3) {
                  const m = parseInt(parts[1], 10);
                  const d = parseInt(parts[2], 10);
                  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
                  calMonth = months[m - 1] || "DUE";
                  calDay = String(d);
                }
              }

              // Visual styling based on urgency (D-day)
              let itemBg = "bg-white border-slate-100 hover:border-slate-200";
              let calBorder = "border-pink-100";
              if (days !== null) {
                if (days <= 7) {
                  itemBg = "bg-[#FBEAF0]/60 border-pink-100/60 hover:bg-[#FBEAF0]";
                  calBorder = "border-[#ED93B1]/40";
                } else if (days <= 30) {
                  itemBg = "bg-amber-50/40 border-amber-100/50 hover:bg-amber-50/60";
                  calBorder = "border-amber-250/20";
                }
              }

              return (
                <div
                  key={contract.id}
                  id={`schedule-item-${idx}`}
                  onClick={() => onOpenContract(contract)}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${itemBg} shadow-xs active:scale-[0.99]`}
                >
                  {/* Calendar block */}
                  <div className={`flex-shrink-0 w-11 h-11 bg-white rounded-xl flex flex-col items-center justify-center border ${calBorder} shadow-2xs`}>
                    <span className="text-[9px] text-[#D4537E] font-bold uppercase leading-none mt-0.5">{calMonth}</span>
                    <span className="text-base font-extrabold text-slate-800 leading-none mt-1">{calDay}</span>
                  </div>

                  {/* Content block */}
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-extrabold text-slate-800 truncate max-w-[120px]">
                        {contract.vendor_name}
                      </span>
                      <span className="text-[9px] text-[#D4537E] bg-[#FBEAF0] font-bold px-1.5 py-0.5 rounded">
                        {contract.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <span className="font-extrabold text-[#D4537E]">{formatWon(remainingVal)}</span>
                    </div>
                  </div>

                  {/* Urgency Badge block */}
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold shadow-3xs ${badge.style}`}>
                    {badge.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
