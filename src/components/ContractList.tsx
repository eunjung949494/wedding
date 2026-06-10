import { useState } from "react";
import { WeddingCategory, Contract, CATEGORIES, ContractDetailRow } from "../types";
import { formatWon, formatPhone } from "../utils";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { 
  X, Phone, Calendar, DollarSign, FileText, Trash2, Edit3, 
  Check, Plus, Trash, AlertTriangle, ArrowRight, UserCircle 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { encryptText, decryptText } from "../lib/encryption";

interface ContractListProps {
  contracts: Contract[];
  selectedContract: Contract | null;
  onOpenContract: (contract: Contract | null) => void;
  uid: string;
  isDesktop?: boolean;
}

const statusThemes = {
  계약완료: { bg: "bg-[#FBEAF0]", text: "text-[#D4537E]" },
  잔금대기: { bg: "bg-[#FAEEDA]", text: "text-[#C26B1E]" },
  잔금완료: { bg: "bg-[#EAF3DE]", text: "text-[#558B2F]" },
  취소: { bg: "bg-slate-100", text: "text-slate-500" },
};

export default function ContractList({ contracts, selectedContract, onOpenContract, uid, isDesktop = false }: ContractListProps) {
  const [activeCategory, setActiveCategory] = useState<"전체" | WeddingCategory>("전체");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  // Edit states inside bottom sheet
  const [editVendorName, setEditVendorName] = useState("");
  const [editCategory, setEditCategory] = useState<WeddingCategory>("기타");
  const [editContractDate, setEditContractDate] = useState("");
  const [editEventDate, setEditEventDate] = useState("");
  const [editTotalAmount, setEditTotalAmount] = useState<number>(0);
  const [editPaidAmount, setEditPaidAmount] = useState<number>(0);
  const [editBalanceDueDate, setEditBalanceDueDate] = useState("");
  const [editManagerName, setEditManagerName] = useState("");
  const [editManagerPhone, setEditManagerPhone] = useState("");
  const [editStatus, setEditStatus] = useState<"계약완료" | "잔금대기" | "잔금완료" | "취소">("계약완료");
  const [editMemo, setEditMemo] = useState("");
  const [editDetails, setEditDetails] = useState<ContractDetailRow[]>([]);

  // Edit states for discounts
  const [editPartnerCode, setEditPartnerCode] = useState("");
  const [editPartnerDiscountPerCount, setEditPartnerDiscountPerCount] = useState<number>(0);
  const [editPartnerDiscountCount, setEditPartnerDiscountCount] = useState<number>(0);
  const [editPartnerDiscountTotal, setEditPartnerDiscountTotal] = useState<number>(0);
  
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Populate edits
  const startEditing = (contract: Contract) => {
    const pwd = localStorage.getItem("wedding_vault_pwd") || "";
    setEditVendorName(contract.vendor_name);
    setEditCategory(contract.category);
    setEditContractDate(contract.contract_date || "");
    setEditEventDate(contract.event_date || "");
    setEditTotalAmount(contract.total_amount || 0);
    setEditPaidAmount(contract.paid_amount || 0);
    setEditBalanceDueDate(contract.balance_due_date || "");
    setEditManagerName(contract.manager_name || "");
    setEditManagerPhone(contract.manager_phone ? decryptText(contract.manager_phone, pwd) : "");
    setEditStatus(contract.status || "계약완료");
    setEditMemo(contract.memo || "");
    setEditDetails([...(contract.details || [])]);
    setEditPartnerCode(contract.partner_code || "");
    setEditPartnerDiscountPerCount(contract.partner_discount_per_count || 0);
    setEditPartnerDiscountCount(contract.partner_discount_count || 0);
    setEditPartnerDiscountTotal(contract.partner_discount_total || 0);
    setIsEditing(true);
    setDeleteConfirm(false);
  };

  const handleSaveEdits = async (contractId: string) => {
    if (!editVendorName.trim()) return;
    setLoading(true);
    try {
      const pwd = localStorage.getItem("wedding_vault_pwd") || "";
      const encryptedPhone = encryptText(editManagerPhone.trim(), pwd);

      const contractRef = doc(db, "contracts", contractId);
      const updateData = {
        vendor_name: editVendorName,
        category: editCategory,
        contract_date: editContractDate,
        event_date: editEventDate,
        total_amount: Number(editTotalAmount),
        paid_amount: Number(editPaidAmount),
        balance_due_date: editBalanceDueDate,
        manager_name: editManagerName,
        manager_phone: encryptedPhone,
        status: editStatus,
        memo: editMemo,
        details: editDetails,
        last_edited_by: uid,
        updated_at: serverTimestamp(),
        partner_code: editPartnerCode.trim(),
        partner_discount_per_count: Number(editPartnerDiscountPerCount),
        partner_discount_count: Number(editPartnerDiscountCount),
        partner_discount_total: Number(editPartnerDiscountTotal),
      };

      await updateDoc(contractRef, updateData).catch(err => 
        handleFirestoreError(err, OperationType.UPDATE, `contracts/${contractId}`)
      );

      // Success
      setIsEditing(false);
      // Update local object to reflect in detail sheet instantly
      onOpenContract({
        ...selectedContract!,
        ...updateData,
        updated_at: new Date()
      } as any);
    } catch (e) {
      console.error(e);
      alert("계약서 수정 중 오차가 발생하였습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContract = async (contractId: string) => {
    setLoading(true);
    try {
      const contractRef = doc(db, "contracts", contractId);
      await deleteDoc(contractRef).catch(err => 
        handleFirestoreError(err, OperationType.DELETE, `contracts/${contractId}`)
      );
      onOpenContract(null);
      setDeleteConfirm(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Details Row helpers
  const handleDetailRowChange = (index: number, key: keyof ContractDetailRow, value: string) => {
    const updated = [...editDetails];
    updated[index] = { ...updated[index], [key]: value };
    setEditDetails(updated);
  };

  const addDetailRow = () => {
    setEditDetails([...editDetails, { 구분: "", 내용: "", 시점: "" }]);
  };

  const removeDetailRow = (index: number) => {
    setEditDetails(editDetails.filter((_, i) => i !== index));
  };

  // Filtering contracts
  const filteredContracts = contracts.filter((c) => {
    if (activeCategory === "전체") return true;
    return c.category === activeCategory;
  });

  // Calculate D-day
  const ddayToday = new Date();
  ddayToday.setHours(0,0,0,0);
  const getDDay = (dateStr: string) => {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    const diff = target.getTime() - ddayToday.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const renderDDayBadge = (dateStr: string) => {
    const days = getDDay(dateStr);
    if (days === null) return null;
    if (days < 0) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 text-slate-400">종료</span>;
    if (days === 0) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-extrabold animate-pulse">D-Day</span>;
    if (days <= 7) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold border border-red-200">D-{days}</span>;
    if (days <= 30) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 font-semibold border border-amber-200">D-{days}</span>;
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-600 font-medium">D-{days}</span>;
  };

  return (
    <div id="contract-view-wrapper" className="flex flex-col gap-4">
      {/* 1. Horizontal Scroll Categories Tabs */}
      <div id="categories-scroll-bar" className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin -mx-4 px-4">
        <button
          onClick={() => setActiveCategory("전체")}
          className={`px-4.5 py-2.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all duration-300 cursor-pointer ${
            activeCategory === "전체"
              ? "bg-[#D4537E] text-white shadow-sm shadow-pink-200"
              : "bg-white text-slate-500 hover:text-[#D4537E] hover:bg-[#FBEAF0]/40 border border-slate-100"
          }`}
        >
          전체
        </button>
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`px-4.5 py-2.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all duration-300 cursor-pointer ${
              activeCategory === category
                ? "bg-[#D4537E] text-white shadow-sm shadow-pink-200"
                : "bg-white text-slate-500 hover:text-[#D4537E] hover:bg-[#FBEAF0]/40 border border-slate-100"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* 2. List of Cards */}
      {filteredContracts.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 border-2 border-dashed border-slate-100 text-center flex flex-col items-center justify-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-[#FBEAF0] flex items-center justify-center text-[#D4537E] mb-3 border border-pink-105/20">
            <FileText className="w-5 h-5" />
          </div>
          <p className="text-slate-500 text-xs font-extrabold">등록된 계약 카드가 없습니다.</p>
          <span className="text-[10px] text-slate-400 mt-1">우측 하단의 [추가] 탭에서 계약서를 올려보세요.</span>
        </div>
      ) : (
        <div id="contract-cards-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContracts.map((contract) => {
            const theme = statusThemes[contract.status || "계약완료"];
            const remaining = Math.max(0, contract.total_amount - contract.paid_amount - (contract.partner_discount_total || 0));
            return (
              <motion.div
                key={contract.id}
                onClick={() => onOpenContract(contract)}
                whileTap={{ scale: 0.98 }}
                className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-xs flex flex-col gap-3.5 cursor-pointer hover:border-[#ED93B1]/40 hover:shadow-sm transition-all"
              >
                {/* Top Vendor area */}
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] bg-[#FBEAF0] text-[#D4537E] font-bold px-2 py-0.5 rounded">
                        {contract.category}
                      </span>
                      {renderDDayBadge(contract.balance_due_date)}
                    </div>
                    <h3 className="text-base font-extrabold text-slate-800 tracking-tight mt-1">
                      {contract.vendor_name}
                    </h3>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full shadow-2xs ${theme.bg} ${theme.text}`}>
                    {contract.status}
                  </span>
                </div>

                {/* Amount and Dates area */}
                <div className="flex justify-between items-end border-t border-slate-50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-400 font-bold">남은 잔금</span>
                    <span className="text-sm font-black text-[#D4537E]">
                      {formatWon(remaining)}
                    </span>
                  </div>
                  <div className="text-right flex flex-col gap-0.5">
                    <span className="text-[9px] text-slate-400 font-medium">이용 예정일</span>
                    <span className="text-[11px] text-slate-700 font-extrabold">
                      {contract.event_date || "미정"}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 3. Detailed Bottom Sheet Modal */}
      <AnimatePresence>
        {selectedContract && (
          <>
            {/* Backdrop */}
            <motion.div
              onClick={() => {
                if (!isEditing) onOpenContract(null);
                else if (confirm("작성 중인 내용이 지워집니다. 뒤로 가시겠습니까?")) {
                  setIsEditing(false);
                  onOpenContract(null);
                }
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-40"
            />

            {/* Bottom Sheet container (Becomes a luxurious right drawer sidebar on PC) */}
            <motion.div
              id="detail-bottom-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white rounded-t-3xl z-50 shadow-2xl overflow-y-auto max-h-[92vh] border-t border-slate-100 flex flex-col md:bottom-0 md:top-0 md:right-0 md:left-auto md:translate-x-0 md:w-[480px] md:max-w-md md:rounded-t-none md:rounded-l-[32px] md:max-h-screen md:border-t-0 md:border-l md:border-slate-150"
            >
              {/* Grab handle (Hidden on desktop) */}
              <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-3 flex-shrink-0 md:hidden" />

              {/* Header inside Bottom Sheet */}
              <div className="px-5 pb-3 flex justify-between items-center border-b border-slate-50 flex-shrink-0">
                <div>
                  <span className="text-[10px] font-bold text-[#D4537E] bg-[#FBEAF0] px-2 py-0.5 rounded">
                    {isEditing ? "계약 변경" : selectedContract.category}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">
                    {isEditing ? "정보 수정하기" : selectedContract.vendor_name}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {!isEditing && (
                    <button
                      onClick={() => startEditing(selectedContract)}
                      className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (!isEditing) onOpenContract(null);
                      else if (confirm("작성 중인 내용이 지워집니다. 닫으시겠습니까?")) {
                        setIsEditing(false);
                        onOpenContract(null);
                      }
                    }}
                    className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-xl"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Body inside Bottom Sheet */}
              <div className="p-5 flex-1 overflow-y-auto space-y-5">
                {isEditing ? (
                  /* ----------------- EDITING MODE ----------------- */
                  <div className="space-y-4">
                    {/* 1. Vendor Name */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 mb-1 block">업체 이름 *</label>
                      <input
                        type="text"
                        value={editVendorName || ""}
                        onChange={(e) => setEditVendorName(e.target.value)}
                        className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-800 font-medium"
                      />
                    </div>

                    {/* 2. Category & Status */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 mb-1 block">카테고리</label>
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value as WeddingCategory)}
                          className="w-full h-11 px-2 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-700 bg-white"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 mb-1 block">계약 상태</label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as any)}
                          className="w-full h-11 px-2 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-700 bg-white"
                        >
                          <option value="계약완료">계약완료</option>
                          <option value="잔금대기">잔금대기</option>
                          <option value="잔금완료">잔금완료</option>
                          <option value="취소">취소</option>
                        </select>
                      </div>
                    </div>

                    {/* 3. Dates Area */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 mb-1 block">계약서 작성일</label>
                        <input
                          type="date"
                          value={editContractDate || ""}
                          onChange={(e) => setEditContractDate(e.target.value)}
                          className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-xs text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 mb-1 block">이용 예정일</label>
                        <input
                          type="date"
                          value={editEventDate || ""}
                          onChange={(e) => setEditEventDate(e.target.value)}
                          className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-xs text-slate-700"
                        />
                      </div>
                    </div>

                    {/* 4. Amounts and Payments */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 mb-1 block">총 계약금액 (원)</label>
                        <input
                          type="number"
                          value={editTotalAmount === 0 ? "" : (editTotalAmount || 0)}
                          placeholder="0"
                          onChange={(e) => setEditTotalAmount(Number(e.target.value))}
                          className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-800 font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 mb-1 block">기납입 금액 (원)</label>
                        <input
                          type="number"
                          value={editPaidAmount === 0 ? "" : (editPaidAmount || 0)}
                          placeholder="0"
                          onChange={(e) => setEditPaidAmount(Number(e.target.value))}
                          className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-800 font-bold"
                        />
                      </div>
                    </div>

                    {/* 5. Balance Pay Date */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 mb-1 block">잔금 납부 기한</label>
                      <input
                        type="date"
                        value={editBalanceDueDate || ""}
                        onChange={(e) => setEditBalanceDueDate(e.target.value)}
                        className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-xs text-slate-700"
                      />
                    </div>

                    {/* Partner code and discount calculator block inside edit mode */}
                    <div className="bg-gradient-to-br from-[#FBEAF0]/30 to-[#FAEEDA]/20 border border-[#ED93B1]/20 rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex items-center gap-1.5 text-xs font-black text-[#D4537E]">
                        <span>💝 짝꿍코드 / 후기 할인 수정</span>
                        <span className="text-[9px] font-semibold text-slate-400 bg-white/80 px-2 py-0.5 rounded-full">잔고 연계차감</span>
                      </div>

                      <div className="grid grid-cols-2 gap-35">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 mb-1 block">추천/짝꿍 코드</label>
                          <input
                            type="text"
                            placeholder="예: 260610민우"
                            value={editPartnerCode}
                            onChange={(e) => setEditPartnerCode(e.target.value)}
                            className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-xs text-slate-700"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-400 mb-1 block">1회당 할인액 (원)</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={editPartnerDiscountPerCount === 0 ? "" : editPartnerDiscountPerCount}
                            onChange={(e) => {
                              const per = Number(e.target.value);
                              setEditPartnerDiscountPerCount(per);
                              setEditPartnerDiscountTotal(per * editPartnerDiscountCount);
                            }}
                            className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-[#D4537E] text-xs font-semibold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 mb-1 block">추천인 횟수 (회)</label>
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => {
                                const newCount = Math.max(0, editPartnerDiscountCount - 1);
                                setEditPartnerDiscountCount(newCount);
                                setEditPartnerDiscountTotal(editPartnerDiscountPerCount * newCount);
                              }}
                              className="w-9 h-10 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-l-xl font-bold flex items-center justify-center active:scale-95"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              value={editPartnerDiscountCount}
                              onChange={(e) => {
                                const cnt = Number(e.target.value);
                                setEditPartnerDiscountCount(cnt);
                                setEditPartnerDiscountTotal(editPartnerDiscountPerCount * cnt);
                              }}
                              className="w-full h-10 text-center border-y border-slate-200 outline-none focus:border-[#D4537E] text-xs text-slate-800 font-bold"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newCount = editPartnerDiscountCount + 1;
                                setEditPartnerDiscountCount(newCount);
                                setEditPartnerDiscountTotal(editPartnerDiscountPerCount * newCount);
                              }}
                              className="w-9 h-10 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-r-xl font-bold flex items-center justify-center active:scale-95"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-400 mb-1 block">총 할인액 (원)</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={editPartnerDiscountTotal === 0 ? "" : editPartnerDiscountTotal}
                            onChange={(e) => setEditPartnerDiscountTotal(Number(e.target.value))}
                            className="w-full h-10 px-3 bg-white border border-[#ED93B1]/40 rounded-xl outline-none focus:border-[#D4537E] text-xs text-[#D4537E] font-bold"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 6. Manager info */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 mb-1 block">담당자 이름</label>
                        <input
                          type="text"
                          placeholder="예: 홍길동 실장"
                          value={editManagerName || ""}
                          onChange={(e) => setEditManagerName(e.target.value)}
                          className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 mb-1 block">담당자 연락처</label>
                        <input
                          type="text"
                          placeholder="010-0000-0000"
                          value={editManagerPhone || ""}
                          onChange={(e) => setEditManagerPhone(e.target.value)}
                          className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-700"
                        />
                      </div>
                    </div>

                    {/* 7. Contract Details Table (Inline editing) */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[11px] font-bold text-slate-500">제공 항목 상세 테이블</label>
                        <button
                          type="button"
                          onClick={addDetailRow}
                          className="text-[10px] font-bold text-[#D4537E] flex items-center gap-0.5 px-2 py-1 bg-[#FBEAF0] rounded-lg active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" /> 행 추가
                        </button>
                      </div>

                      <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
                        <div className="grid grid-cols-12 bg-slate-50 py-2 border-b border-slate-100 text-slate-400 font-bold px-2 text-[10px]">
                          <span className="col-span-3">구분</span>
                          <span className="col-span-5">제공 내용</span>
                          <span className="col-span-3">시점</span>
                          <span className="col-span-1 text-center">삭제</span>
                        </div>
                        {editDetails.length === 0 ? (
                          <div className="text-center py-4 text-slate-300 text-[10px]">상세 행이 비어 있습니다.</div>
                        ) : (
                          <div className="divide-y divide-slate-100 max-h-[220px] overflow-y-auto">
                            {editDetails.map((row, idx) => (
                              <div key={idx} className="grid grid-cols-12 gap-1 py-1.5 px-2 items-center">
                                <input
                                  type="text"
                                  value={row.구분 || ""}
                                  placeholder="예: 촬영본"
                                  onChange={(e) => handleDetailRowChange(idx, "구분", e.target.value)}
                                  className="col-span-3 h-8 px-1.5 border border-slate-100 rounded outline-none focus:border-[#D4537E] text-[11px]"
                                />
                                <input
                                  type="text"
                                  value={row.내용 || ""}
                                  placeholder="예: 원본 USB 제공"
                                  onChange={(e) => handleDetailRowChange(idx, "내용", e.target.value)}
                                  className="col-span-5 h-8 px-1.5 border border-slate-100 rounded outline-none focus:border-[#D4537E] text-[11px]"
                                />
                                <input
                                  type="text"
                                  value={row.시점 || ""}
                                  placeholder="예: 예식 후 14일"
                                  onChange={(e) => handleDetailRowChange(idx, "시점", e.target.value)}
                                  className="col-span-3 h-8 px-1.5 border border-slate-100 rounded outline-none focus:border-[#D4537E] text-[11px]"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeDetailRow(idx)}
                                  className="col-span-1 flex items-center justify-center text-red-400 hover:text-red-600 h-8"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 8. Memo */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 mb-1 block">특이사항 메모</label>
                      <textarea
                        rows={3}
                        value={editMemo || ""}
                        onChange={(e) => setEditMemo(e.target.value)}
                        placeholder="계약 시 필수 확인 특약 또는 정산 정보"
                        className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-xs text-slate-700"
                      />
                    </div>

                    {/* 9. Action Buttons */}
                    <div className="flex gap-2.5 pt-3 border-t border-slate-50">
                      <button
                        onClick={() => setIsEditing(false)}
                        className="flex-1 h-12 bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold rounded-xl active:scale-95 text-xs"
                      >
                        취소
                      </button>
                      <button
                        onClick={() => handleSaveEdits(selectedContract.id)}
                        disabled={loading}
                        className="flex-1 h-12 bg-[#D4537E] hover:bg-[#c2466e] text-white font-bold rounded-xl active:scale-95 text-xs flex items-center justify-center gap-1.5"
                      >
                        {loading ? "저장 중..." : <><Check className="w-4 h-4" /> 저장 완료</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ----------------- STANDBY VIEW MODE ----------------- */
                  <div className="space-y-4 text-slate-800">
                    {/* Amount summary panel */}
                    <div className="bg-slate-50 p-4.5 rounded-2xl flex flex-col gap-3 font-medium">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">총 계약금액</span>
                        <span className="text-slate-800 font-bold">{formatWon(selectedContract.total_amount)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">납부 완료금액</span>
                        <span className="text-slate-800 font-semibold">{formatWon(selectedContract.paid_amount)}</span>
                      </div>
                      
                      {selectedContract.partner_discount_total ? (
                        <div className="flex justify-between items-center text-xs text-[#D4537E]">
                          <span className="text-[#D4537E]/85 font-extrabold flex items-center gap-1">
                            💝 짝꿍코드 및 후기 할인
                            {selectedContract.partner_code && (
                              <span className="text-[9px] bg-white border border-pink-100 px-1.5 py-0.5 rounded-lg text-[#D4537E] font-medium font-mono">
                                {selectedContract.partner_code}
                              </span>
                            )}
                          </span>
                          <span className="font-extrabold">
                            -{formatWon(selectedContract.partner_discount_total)}
                            {selectedContract.partner_discount_count ? ` (${selectedContract.partner_discount_count}회)` : ""}
                          </span>
                        </div>
                      ) : selectedContract.partner_code ? (
                        <div className="flex justify-between items-center text-xs text-slate-500">
                          <span className="text-slate-400 font-bold flex items-center gap-1">
                            💝 등록된 짝꿍코드
                          </span>
                          <span className="font-bold text-slate-700 bg-white border border-slate-200 px-2.5 py-0.5 rounded-lg font-mono">
                            {selectedContract.partner_code}
                          </span>
                        </div>
                      ) : null}

                      <div className="flex justify-between items-center border-t border-slate-100 pt-2.5 mt-0.5">
                        <span className="text-xs font-bold text-[#D4537E]">납부 대기 잔금</span>
                        <span className="text-base font-extrabold text-[#D4537E]">
                          {formatWon(Math.max(0, selectedContract.total_amount - selectedContract.paid_amount - (selectedContract.partner_discount_total || 0)))}
                        </span>
                      </div>
                      {selectedContract.balance_due_date && (
                        <div className="bg-white px-3 py-2 rounded-xl text-[11px] text-slate-500 border border-slate-100 flex justify-between items-center mt-1">
                          <span>잔금 기한: {selectedContract.balance_due_date}</span>
                          {renderDDayBadge(selectedContract.balance_due_date)}
                        </div>
                      )}
                    </div>

                    {/* Schedule dates details */}
                    <div className="grid grid-cols-2 gap-3 bg-white border border-slate-50 p-3.5 rounded-2xl">
                      <div className="flex items-center gap-2.5">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold leading-none mb-0.5">계약 체결일</span>
                          <span className="text-xs font-bold text-slate-700">{selectedContract.contract_date || "기록 없음"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 border-l border-slate-100 pl-3">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold leading-none mb-0.5">이용 예정일</span>
                          <span className="text-xs font-bold text-slate-700">{selectedContract.event_date || "기록 없음"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Vendor Manager Info with Decryption */}
                    {(() => {
                      const pwd = localStorage.getItem("wedding_vault_pwd") || "";
                      const decryptedPhone = selectedContract.manager_phone 
                        ? decryptText(selectedContract.manager_phone, pwd)
                        : "";
                      
                      const hasManager = !!selectedContract.manager_name;
                      const hasPhone = !!decryptedPhone;
                      
                      if (!hasManager && !hasPhone) return null;
                      
                      return (
                        <div className="bg-white border border-slate-50 p-3.5 rounded-2xl flex justify-between items-center">
                          <div className="flex items-center gap-2.5">
                            <UserCircle className="w-5 h-5 text-slate-400" />
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold leading-none mb-0.5">계약 담당자</span>
                              <span className="text-xs font-bold text-slate-700 block">
                                {selectedContract.manager_name || "담당 실장 / 본사"}
                              </span>
                              {decryptedPhone && (
                                <span className="text-[10px] text-[#D4537E] font-extrabold tracking-tight mt-0.5 flex items-center gap-1">
                                  <span>🔒 {decryptedPhone}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          {decryptedPhone && (
                            <a
                              href={`tel:${decryptedPhone}`}
                              className="bg-[#FBEAF0] text-[#D4537E] p-2.5 rounded-xl hover:bg-[#F3D1DE] active:scale-95 transition-all flex items-center justify-center"
                            >
                              <Phone className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      );
                    })()}

                    {/* Details checklist table */}
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-800 mb-2.5 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-slate-500" /> 제공 항목 상세 테이블 ({selectedContract.details?.length || 0})
                      </h3>
                      <div className="border border-slate-100 rounded-xl overflow-hidden bg-white">
                        <table id="details-table" className="w-full text-left text-[11px] border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                              <th className="py-2.5 px-3 w-1/4">구분</th>
                              <th className="py-2.5 px-3 w-1/2">내용</th>
                              <th className="py-2.5 px-3 w-1/4 text-center">완료 시점</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(!selectedContract.details || selectedContract.details.length === 0) ? (
                              <tr>
                                <td colSpan={3} className="py-6 text-center text-slate-300 font-medium">제공 항목 내용이 기록되어 있지 않습니다.</td>
                              </tr>
                            ) : (
                              selectedContract.details.map((row, idx) => (
                                <tr key={idx} className="border-b border-slate-50 last:border-none hover:bg-slate-50/50">
                                  <td className="py-2.5 px-3 font-bold text-slate-700">{row.구분 || "-"}</td>
                                  <td className="py-2.5 px-3 text-slate-500 leading-relaxed">{row.내용 || "-"}</td>
                                  <td className="py-2.5 px-3 text-slate-400 text-center">{row.시점 || "-"}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Memo */}
                    {selectedContract.memo && (
                      <div className="bg-[#FAEEDA]/40 border border-[#FAEEDA] p-4 rounded-2xl">
                        <span className="text-[10px] font-extrabold text-[#C26B1E] block mb-1">우리 메모 & 특이사항</span>
                        <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed font-medium">
                          {selectedContract.memo}
                        </p>
                      </div>
                    )}

                    {/* Last edited timestamp footer */}
                    {selectedContract.updated_at && (
                      <div className="text-[9px] text-slate-300 text-right">
                        최종 수정 시간: {
                          typeof selectedContract.updated_at.toDate === "function"
                            ? selectedContract.updated_at.toDate().toLocaleString()
                            : selectedContract.updated_at.seconds
                            ? new Date(selectedContract.updated_at.seconds * 1000).toLocaleString()
                            : new Date(selectedContract.updated_at).toLocaleString()
                        }
                      </div>
                    )}

                    {/* Danger zone delete confirmation */}
                    <div className="pt-3 border-t border-slate-50 flex flex-col gap-2">
                      {deleteConfirm ? (
                        <div className="bg-red-50 p-3 rounded-2xl border border-red-100 flex flex-col gap-2.5">
                          <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-4 h-4" /> 정말로 이 계약 카드를 삭제하시겠습니까? 데이터는 되돌릴 수 없습니다.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setDeleteConfirm(false)}
                              className="flex-1 h-9 bg-white border border-slate-200 text-slate-500 rounded-lg text-xs font-bold"
                            >
                              삭제 취소
                            </button>
                            <button
                              onClick={() => handleDeleteContract(selectedContract.id)}
                              className="flex-1 h-9 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> 영구 삭제
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(true)}
                          className="w-full h-11 hover:bg-red-50 border border-slate-100 text-red-500 font-semibold rounded-xl text-xs active:scale-95 flex items-center justify-center gap-1.5 transition-all"
                        >
                          <Trash2 className="w-4 h-4" /> 계약 카드 삭제하기
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
