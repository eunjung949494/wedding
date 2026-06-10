import React, { useState } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { Heart, Loader2, Lock, User, Sparkles } from "lucide-react";
import { motion } from "motion/react";

interface AuthPageProps {
  onAuthComplete: (coupleId: string, profileName: string) => void;
}

export default function AuthPage({ onAuthComplete }: AuthPageProps) {
  const [loading, setLoading] = useState(false);
  const [weddingId, setWeddingId] = useState("갱정");
  const [password, setPassword] = useState("240302");
  const [nickname, setNickname] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = weddingId.trim();
    const cleanPassword = password.trim();
    const cleanNickname = nickname.trim();

    if (!cleanId || !cleanPassword) {
      setErrorMessage("웨딩 ID와 비밀번호를 모두 입력해 주세요.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    // Safe alphanumeric and Korean/Japanese ID conversion for Firestore doc IDs
    const safeId = cleanId.replace(/[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/g, "").trim();
    if (!safeId) {
      setErrorMessage("웨딩 ID에는 숫자, 한글, 영문자만 사용 가능합니다.");
      setLoading(false);
      return;
    }

    const coupleId = `couple_${safeId}`;
    const uid = `custom_${safeId}`;
    
    const coupleRef = doc(db, "couples", coupleId);

    try {
      const coupleSnap = await getDoc(coupleRef);
      if (coupleSnap.exists()) {
        const coupleData = coupleSnap.data();
        if (coupleData.password && coupleData.password !== cleanPassword) {
          throw new Error("입력하신 웨딩 ID의 비밀번호가 일치하지 않습니다.");
        }
      } else {
        // Create new couple vault
        const inviteCode = (safeId.slice(0, 6) || "WEDDNG").padEnd(6, "X").substring(0, 6).toUpperCase();
        await setDoc(coupleRef, {
          invite_code: inviteCode,
          partner1_id: uid,
          partner2_id: null,
          password: cleanPassword, // Custom password field for verification
          created_at: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `couples/${coupleId}`));
      }

      // Ensure profile exists
      const profileRef = doc(db, "profiles", uid);
      const profileSnap = await getDoc(profileRef);
      if (!profileSnap.exists()) {
        await setDoc(profileRef, {
          name: cleanNickname || cleanId,
          couple_id: coupleId,
          created_at: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `profiles/${uid}`));
      }

      // Store nickname in local storage
      const finalNickname = cleanNickname || cleanId;
      localStorage.setItem("wedding_user_nickname", finalNickname);

      // Store active custom user object
      const customUserObj = {
        uid: uid,
        displayName: finalNickname
      };
      localStorage.setItem("wedding_custom_user", JSON.stringify(customUserObj));
      localStorage.setItem("wedding_couple_id", coupleId);
      localStorage.setItem("wedding_vault_pwd", cleanPassword);

      onAuthComplete(coupleId, finalNickname);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "접속 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-container" className="flex flex-col items-center justify-center min-h-[85vh] px-6 text-slate-800">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[370px] bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col items-center"
      >
        <div className="w-16 h-16 bg-[#FBEAF0] rounded-2xl flex items-center justify-center mb-5 text-[#D4537E]">
          <Heart className="w-8 h-8 fill-current" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1">
          WeddingVault
        </h1>
        <p className="text-sm text-slate-500 text-center mb-6">
          결혼 준비의 모든 계약서와 잔금을 한 번에
        </p>

        {errorMessage && (
          <div className="w-full text-xs text-red-500 bg-red-50 border border-red-100 px-3.5 py-3 rounded-xl mb-5 text-center leading-relaxed">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleAuth} className="w-full flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 pl-1">우리만의 웨딩 ID</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Sparkles className="w-4 h-4 text-[#D4537E]" />
              </span>
              <input
                id="simple-wedding-id"
                type="text"
                placeholder="예: 민우서현, wedding2026"
                value={weddingId}
                onChange={(e) => setWeddingId(e.target.value)}
                className="w-full h-11 pl-10 pr-4 text-sm rounded-xl border border-slate-200 outline-none focus:border-[#D4537E] font-medium"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 pl-1">접속 비밀번호</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                id="simple-password"
                type="password"
                placeholder="지정할 비밀번호 (6자리 이상 추천)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 pl-10 pr-4 text-sm rounded-xl border border-slate-200 outline-none focus:border-[#D4537E] font-medium"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-400 pl-1">내 이름 또는 닉네임 (선택)</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <User className="w-4 h-4" />
              </span>
              <input
                id="simple-nickname"
                type="text"
                placeholder="예: 민우 (기본값은 웨딩 ID)"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full h-11 pl-10 pr-4 text-sm rounded-xl border border-slate-200 outline-none focus:border-[#D4537E] font-medium"
              />
            </div>
          </div>

          <button
            id="simple-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-[#D4537E] text-white hover:bg-[#c2466e] font-semibold text-sm rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-2 cursor-pointer shadow-sm shadow-[#D4537E]/10"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-white" />
            ) : (
              "로그인 / 보관함 개설하기"
            )}
          </button>
        </form>

        <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl mt-6 text-[11px] text-slate-500 leading-relaxed text-center">
          💡 <span className="font-bold text-slate-700">처음 접속하는 ID</span>인 경우 자동으로 해당 ID의 보관함이 생성됩니다.<br/>
          상대방과 하나의 보관함을 실시간 공유하려면,<br/>
          <span className="font-semibold text-[#D4537E]">동일한 웨딩 ID와 비밀번호</span>로 로그인해 주세요!
        </div>
      </motion.div>
    </div>
  );
}
