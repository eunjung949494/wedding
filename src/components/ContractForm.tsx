import React, { useState, useRef, DragEvent } from "react";
import { WeddingCategory, ContractDetailRow, CATEGORIES, CATEGORY_DEFAULT_DETAILS } from "../types";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { 
  Sparkles, FileText, Upload, Plus, Trash, Check, Loader2, Info, ArrowRight, TableProperties 
} from "lucide-react";
import { motion } from "motion/react";
import { encryptText } from "../lib/encryption";

interface ContractFormProps {
  coupleId: string;
  uid: string;
  onSuccess: () => void;
}

export default function ContractForm({ coupleId, uid, onSuccess }: ContractFormProps) {
  // General UI states
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form Fields
  const [vendorName, setVendorName] = useState("");
  const [category, setCategory] = useState<WeddingCategory>("기타");
  const [contractDate, setContractDate] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [balanceDueDate, setBalanceDueDate] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerPhone, setManagerPhone] = useState("");
  const [status, setStatus] = useState<"계약완료" | "잔금대기" | "잔금완료" | "취소">("계약완료");
  const [memo, setMemo] = useState("");
  const [details, setDetails] = useState<ContractDetailRow[]>(CATEGORY_DEFAULT_DETAILS["기타"]);

  // Partner Discount & Review states
  const [partnerCode, setPartnerCode] = useState("");
  const [partnerDiscountPerCount, setPartnerDiscountPerCount] = useState<number>(0);
  const [partnerDiscountCount, setPartnerDiscountCount] = useState<number>(0);
  const [partnerDiscountTotal, setPartnerDiscountTotal] = useState<number>(0);

  // Drag handlers
  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    if (!file) return;
    setAiLoading(true);
    setErrorMessage("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/analyze-contract", {
        method: "POST",
        body: formData,
      });

      let resJson: any = null;
      let rawText = "";
      try {
        rawText = await response.text();
        if (rawText) {
          resJson = JSON.parse(rawText);
        }
      } catch (err) {
        if (!response.ok) {
          const displaySnippet = rawText 
            ? (rawText.length > 150 ? rawText.substring(0, 150) + "..." : rawText) 
            : "서버가 빈 응답을 반환했습니다.";
          throw new Error(`서버 통신 실패 (상태 코드: ${response.status}). 상세 정보: ${displaySnippet}`);
        }
      }

      if (!response.ok) {
        const errMsg = resJson?.error || resJson?.details || "서버 내부 오류가 발생했습니다.";
        throw new Error(`계약서 분석 실패: ${errMsg}`);
      }

      if (resJson && resJson.error) {
        throw new Error(resJson.error);
      }

      // Sync form fields with AI extracted fields
      if (resJson.vendor_name) setVendorName(resJson.vendor_name);
      if (resJson.category && CATEGORIES.includes(resJson.category)) {
        setCategory(resJson.category);
      }
      if (resJson.contract_date) setContractDate(resJson.contract_date);
      if (resJson.event_date) setEventDate(resJson.event_date);
      
      const parsedTotal = Number(resJson.total_amount || 0);
      const parsedPaid = Number(resJson.paid_amount || 0);
      setTotalAmount(parsedTotal);
      setPaidAmount(parsedPaid);
      
      if (resJson.balance_due_date) setBalanceDueDate(resJson.balance_due_date);
      if (resJson.manager_name) setManagerName(resJson.manager_name);
      if (resJson.manager_phone) setManagerPhone(resJson.manager_phone);
      if (resJson.memo) setMemo(resJson.memo);
      
      if (resJson.details && Array.isArray(resJson.details)) {
        setDetails(resJson.details);
      } else {
        // Fallback default details for extracted category
        const cat = (resJson.category && CATEGORIES.includes(resJson.category) ? resJson.category : "기타") as WeddingCategory;
        setDetails(CATEGORY_DEFAULT_DETAILS[cat]);
      }

      // Automatically compute status based on amounts parsed
      if (parsedTotal > 0 && parsedPaid >= parsedTotal) {
        setStatus("잔금완료");
      } else if (parsedPaid > 0) {
        setStatus("잔금대기");
      } else {
        setStatus("계약완료");
      }

    } catch (e: any) {
      console.error(e);
      setErrorMessage(e?.message || "AI 분석 도중 문제가 생겼습니다. 직접 계약을 입력하실 수도 있습니다.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Change category manually and prompt autofill
  const handleCategoryChange = (cat: WeddingCategory) => {
    setCategory(cat);
    // Autofill with category default template structure
    setDetails(CATEGORY_DEFAULT_DETAILS[cat] || []);
  };

  // Details Row Editing
  const handleRowChange = (index: number, key: keyof ContractDetailRow, value: string) => {
    const updated = [...details];
    updated[index] = { ...updated[index], [key]: value };
    setDetails(updated);
  };

  const addRow = () => {
    setDetails([...details, { 구분: "", 내용: "", 시점: "" }]);
  };

  const removeRow = (index: number) => {
    setDetails(details.filter((_, i) => i !== index));
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) {
      setErrorMessage("업체 이름을 입력하세요.");
      return;
    }
    setLoading(true);
    setErrorMessage("");

    try {
      const contractsRef = collection(db, "contracts");
      const contractId = `contract_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const docRef = doc(contractsRef, contractId);

      const pwd = localStorage.getItem("wedding_vault_pwd") || "";
      const encryptedPhone = encryptText(managerPhone.trim(), pwd);

      const contractPayload = {
        couple_id: coupleId,
        vendor_name: vendorName.trim(),
        category,
        contract_date: contractDate,
        event_date: eventDate,
        total_amount: Number(totalAmount || 0),
        paid_amount: Number(paidAmount || 0),
        balance_due_date: balanceDueDate,
        manager_name: managerName.trim(),
        manager_phone: encryptedPhone,
        status,
        memo,
        details,
        last_edited_by: uid,
        updated_at: serverTimestamp(),
        created_at: serverTimestamp(),
        // Discounts
        partner_code: partnerCode.trim(),
        partner_discount_per_count: Number(partnerDiscountPerCount || 0),
        partner_discount_count: Number(partnerDiscountCount || 0),
        partner_discount_total: Number(partnerDiscountTotal || 0),
      };

      await setDoc(docRef, contractPayload).catch(err => 
        handleFirestoreError(err, OperationType.CREATE, `contracts/${contractId}`)
      );

      // Clean form fields
      setVendorName("");
      setCategory("기타");
      setContractDate("");
      setEventDate("");
      setTotalAmount(0);
      setPaidAmount(0);
      setBalanceDueDate("");
      setManagerName("");
      setManagerPhone("");
      setStatus("계약완료");
      setMemo("");
      setDetails(CATEGORY_DEFAULT_DETAILS["기타"]);
      setPartnerCode("");
      setPartnerDiscountPerCount(0);
      setPartnerDiscountCount(0);
      setPartnerDiscountTotal(0);

      onSuccess(); // Switch back to list view tab
    } catch (err: any) {
      console.error(err);
      setErrorMessage("계약 카드를 생성하는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="contract-form-container" className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
      {/* Left Column: AI contract files upload and analyzer */}
      <div className="md:col-span-5 flex flex-col gap-4 md:sticky md:top-[90px]">
        {/* 1. Header Sparkle tag */}
        <div className="bg-gradient-to-br from-[#FBEAF0] to-[#FBEAF0]/40 border border-[#ED93B1]/20 p-5 rounded-3xl flex flex-col gap-3.5 relative overflow-hidden shadow-xs">
          <div className="absolute right-0 bottom-0 text-[#ED93B1] opacity-10 pointer-events-none -mr-4 -mb-4">
            <Sparkles className="w-24 h-24" />
          </div>
          <div className="z-10">
            <div className="flex items-center gap-1.5 text-xs font-black text-[#D4537E]">
              <Sparkles className="w-3.5 h-3.5 fill-current animate-pulse" />
              <span>AI 계약서 분석 업로드</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed mt-1.5 font-medium">
              계약서 사진(JPG, PNG) 및 PDF 문서를 올리면 Gemini AI가 계약 내역과 금액, 제공 테이블을 자동으로 파싱하여 입력해 줍니다.
            </p>
          </div>

          {/* AI Drop/Upload box */}
          <div
            id="ai-dropzone"
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`h-36 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
              dragActive
                ? "border-[#D4537E] bg-[#FBEAF0] shadow-md shadow-pink-100"
                : "border-[#ED93B1]/40 bg-white hover:border-[#D4537E]"
            } relative overflow-hidden`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            {aiLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-[#D4537E]" />
                <span className="text-xs font-extrabold text-slate-700 animate-pulse">계약서 문서를 분석하고 있습니다...</span>
                <span className="text-[10px] text-[#D4537E] font-medium bg-[#FBEAF0] px-2 py-0.5 rounded-full">대략 5초 가량 소요됩니다</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 text-center">
                <div className="w-10 h-10 rounded-full bg-[#FBEAF0]/40 flex items-center justify-center text-[#D4537E] border border-pink-100/50">
                  <Upload className="w-5 h-5 animate-bounce" style={{ animationDuration: '3s' }} />
                </div>
                <p className="text-xs font-extrabold text-slate-700">
                  파일 끌어다 놓기 또는 클릭
                </p>
                <span className="text-[10px] text-slate-400 font-medium">
                  지원 파일: JPEG, PNG, PDF (최대 10MB)
                </span>
              </div>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="text-xs text-red-500 bg-red-50 border border-red-100 px-3 py-2.5 rounded-xl text-center font-bold">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Right Column: Direct details entry */}
      <form onSubmit={handleSubmit} className="md:col-span-7 bg-white p-5 rounded-3xl border border-slate-150/70 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-slate-50 pb-2.5">
          <FileText className="w-4.5 h-4.5 text-[#D4537E]" />
          <h3 className="text-sm font-black text-slate-900">계약 정보 직접 입력</h3>
        </div>

        {/* Vendor Name */}
        <div>
          <label className="text-[11px] font-bold text-slate-400 mb-1 block">업체 이름 *</label>
          <input
            id="form-vendor-name"
            type="text"
            required
            placeholder="업체명을 입력해주세요"
            value={vendorName || ""}
            onChange={(e) => setVendorName(e.target.value)}
            className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-800 font-medium"
          />
        </div>

        {/* Category Selector */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1 block">카테고리</label>
            <select
              id="form-category"
              value={category || "기타"}
              onChange={(e) => handleCategoryChange(e.target.value as WeddingCategory)}
              className="w-full h-11 px-2 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-700 bg-white cursor-pointer"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1 block">진행 상태</label>
            <select
              id="form-status"
              value={status || "계약완료"}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full h-11 px-2 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-700 bg-white cursor-pointer"
            >
              <option value="계약완료">계약완료</option>
              <option value="잔금대기">잔금대기</option>
              <option value="잔금완료">잔금완료</option>
              <option value="취소">취소</option>
            </select>
          </div>
        </div>

        {/* Important Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1 block">계약 일자</label>
            <input
              id="form-contract-date"
              type="date"
              value={contractDate || ""}
              onChange={(e) => setContractDate(e.target.value)}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-700 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1 block">이용 예정일</label>
            <input
              id="form-event-date"
              type="date"
              value={eventDate || ""}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-700 text-xs"
            />
          </div>
        </div>

        {/* Important Amounts keys */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1 block">총 계약금액 (원)</label>
            <input
              id="form-total-amount"
              type="number"
              placeholder="0"
              value={totalAmount === 0 ? "" : (totalAmount || 0)}
              onChange={(e) => {
                const val = Number(e.target.value);
                setTotalAmount(val);
                // Auto compute status basic check
                if (val > 0 && paidAmount >= val) setStatus("잔금완료");
                else if (paidAmount > 0) setStatus("잔금대기");
              }}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-800 font-bold"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1 block">기납입 금액 (원)</label>
            <input
              id="form-paid-amount"
              type="number"
              placeholder="0"
              value={paidAmount === 0 ? "" : (paidAmount || 0)}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPaidAmount(val);
                // Auto compute status basic check
                if (totalAmount > 0 && val >= totalAmount) setStatus("잔금완료");
                else if (val > 0) setStatus("잔금대기");
              }}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-800 font-bold"
            />
          </div>
        </div>

        {/* Partner code and discount calculator block */}
        <div className="bg-gradient-to-br from-[#FBEAF0]/40 to-[#FAEEDA]/30 border border-[#ED93B1]/20 rounded-2xl p-4 flex flex-col gap-3.5">
          <div className="flex items-center gap-1.5 text-xs font-black text-[#D4537E]">
            <span>💝 짝꿍코드 / 후기 할인 혜택</span>
            <span className="text-[9px] font-semibold text-[#D4537E] bg-white/80 px-2 py-0.5 rounded-full border border-[#ED93B1]/10">잔금 자동 차감</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-35">
            <div>
              <label className="text-[10px] font-bold text-slate-400 mb-1 block">추천/짝꿍 코드</label>
              <input
                id="form-partner-code"
                type="text"
                placeholder="예: 260610민우 (보관용)"
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-xs text-slate-700 font-medium"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 mb-1 block">1회당 할인액 (원)</label>
              <input
                id="form-partner-discount-per"
                type="number"
                placeholder="0"
                value={partnerDiscountPerCount === 0 ? "" : partnerDiscountPerCount}
                onChange={(e) => {
                  const per = Number(e.target.value);
                  setPartnerDiscountPerCount(per);
                  setPartnerDiscountTotal(per * partnerDiscountCount);
                }}
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-[#D4537E] text-xs font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-35">
            <div>
              <label className="text-[10px] font-bold text-slate-400 mb-1 block">추천인 횟수 (회)</label>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    const newCount = Math.max(0, partnerDiscountCount - 1);
                    setPartnerDiscountCount(newCount);
                    setPartnerDiscountTotal(partnerDiscountPerCount * newCount);
                  }}
                  className="w-9 h-10 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-l-xl font-bold flex items-center justify-center transition-colors active:scale-95"
                >
                  -
                </button>
                <input
                  id="form-partner-discount-count"
                  type="number"
                  placeholder="0"
                  value={partnerDiscountCount}
                  onChange={(e) => {
                    const cnt = Number(e.target.value);
                    setPartnerDiscountCount(cnt);
                    setPartnerDiscountTotal(partnerDiscountPerCount * cnt);
                  }}
                  className="w-full h-10 text-center border-y border-slate-200 outline-none focus:border-[#D4537E] text-xs text-slate-800 font-bold"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newCount = partnerDiscountCount + 1;
                    setPartnerDiscountCount(newCount);
                    setPartnerDiscountTotal(partnerDiscountPerCount * newCount);
                  }}
                  className="w-9 h-10 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-r-xl font-bold flex items-center justify-center transition-colors active:scale-95"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 mb-1 block">총 할인액 (원) - 수정가능</label>
              <input
                id="form-partner-discount-total"
                type="number"
                placeholder="0"
                value={partnerDiscountTotal === 0 ? "" : partnerDiscountTotal}
                onChange={(e) => setPartnerDiscountTotal(Number(e.target.value))}
                className="w-full h-10 px-3 bg-white border border-[#ED93B1]/40 rounded-xl outline-none focus:border-[#D4537E] text-xs text-[#D4537E] font-bold"
              />
            </div>
          </div>

          {/* Show calculation live preview */}
          {partnerDiscountTotal > 0 && (
            <div className="bg-white/80 px-3.5 py-2.5 rounded-xl text-[10px] border border-pink-100/10 flex justify-between items-center text-slate-500 animate-fade-in mt-1">
              <span className="font-bold text-slate-500">지불할 남은 잔금 예상</span>
              <span className="font-extrabold text-[#D4537E]">
                {totalAmount - paidAmount - partnerDiscountTotal > 0 
                  ? `${(totalAmount - paidAmount - partnerDiscountTotal).toLocaleString()}원 (기존 잔금에서 ${partnerDiscountTotal.toLocaleString()}원 할인됨)`
                  : "0원 (할인으로 잔금이 모두 상쇄되었습니다! 🎉)"}
              </span>
            </div>
          )}
        </div>

        {/* Balance payment deadline */}
        <div>
          <label className="text-[11px] font-bold text-slate-400 mb-1 block">잔금 납부 기한</label>
          <input
            id="form-balance-due-date"
            type="date"
            value={balanceDueDate || ""}
            onChange={(e) => setBalanceDueDate(e.target.value)}
            className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-700 text-xs"
          />
        </div>

        {/* Manager In-Charge keys */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1 block">담당자 성명</label>
            <input
              id="form-manager-name"
              type="text"
              placeholder="담당 디렉터 이름"
              value={managerName || ""}
              onChange={(e) => setManagerName(e.target.value)}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-700"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 mb-1 block">담당자 연락처</label>
            <input
              id="form-manager-phone"
              type="text"
              placeholder="예: 010-1234-5678"
              value={managerPhone || ""}
              onChange={(e) => setManagerPhone(e.target.value)}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-slate-700"
            />
            <span className="text-[9px] text-[#D4537E] font-bold mt-1 flex items-center gap-0.5">
              🔒 비밀번호로 안전하게 암호화됨
            </span>
          </div>
        </div>

        {/* 3. Details subtable list */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
              <TableProperties className="w-3.5 h-3.5" /> 계약 세부 조항 ({details.length})
            </label>
            <button
              type="button"
              onClick={addRow}
              className="text-[10px] font-bold text-[#D4537E] flex items-center gap-0.5 px-2 py-1 bg-[#FBEAF0] rounded-lg active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> 행 추가
            </button>
          </div>

          <div className="bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 text-xs text-slate-700">
            <div className="grid grid-cols-12 bg-slate-100/50 py-2.5 text-center font-bold text-slate-400 text-[10px] border-b border-slate-100">
              <span className="col-span-3">구분</span>
              <span className="col-span-5">제공 내용</span>
              <span className="col-span-3">완료 시점</span>
              <span className="col-span-1">삭제</span>
            </div>
            
            <div className="divide-y divide-slate-100 max-h-[250px] overflow-y-auto">
              {details.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1 py-1.5 px-2 items-center">
                  <input
                    type="text"
                    placeholder="구분"
                    value={row.구분 || ""}
                    onChange={(e) => handleRowChange(idx, "구분", e.target.value)}
                    className="col-span-3 h-8.5 px-1.5 bg-white border border-slate-200 rounded text-[11px] focus:border-[#D4537E]"
                  />
                  <input
                    type="text"
                    placeholder="상세 품목"
                    value={row.내용 || ""}
                    onChange={(e) => handleRowChange(idx, "내용", e.target.value)}
                    className="col-span-5 h-8.5 px-1.5 bg-white border border-slate-200 rounded text-[11px] focus:border-[#D4537E]"
                  />
                  <input
                    type="text"
                    placeholder="제공 시점"
                    value={row.시점 || ""}
                    onChange={(e) => handleRowChange(idx, "시점", e.target.value)}
                    className="col-span-3 h-8.5 px-1.5 bg-white border border-slate-200 rounded text-[11px] focus:border-[#D4537E]"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="col-span-1 text-red-400 hover:text-red-600 flex items-center justify-center p-1 cursor-pointer transition-colors"
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-slate-300 mt-1 leading-normal">
            * 카테고리를 변경하면 해당 카테고리에 적합한 기본 서식 항목들로 자동 대체(Autofill)됩니다.
          </p>
        </div>

        {/* Memo & Notes details */}
        <div>
          <label className="text-[11px] font-bold text-slate-400 mb-1 block">특이사항 및 메모</label>
          <textarea
            id="form-memo"
            rows={3}
            placeholder="환불 기준, 위약금 요율, 필수 추가금(출장비 등)에 대해 자유롭게 메모해 두세요"
            value={memo || ""}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:border-[#D4537E] text-xs text-slate-700"
          />
        </div>

        {/* Submit */}
        <button
          id="form-submit-btn"
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-[#D4537E] hover:bg-[#c2466e] text-white font-bold rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 text-sm mt-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              계약 카드 생성 중...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              계약 카드 생성하기
            </>
          )}
        </button>
      </form>
    </div>
  );
}
