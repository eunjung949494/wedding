import { useState } from "react";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { Heart, Search, Loader2 } from "lucide-react";
import { motion } from "motion/react";

interface AuthPageProps {
  onAuthComplete: (coupleId: string, profileName: string) => void;
}

export default function AuthPage({ onAuthComplete }: AuthPageProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"login" | "profile" | "couple_choice" | "enter_code" | "sharing">("login");
  const [userName, setUserName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [uid, setUid] = useState("");
  const [createdCode, setCreatedCode] = useState("");

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage("");
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      if (!user) throw new Error("Google 로그인에 실패했습니다.");

      setUid(user.uid);
      if (user.displayName) {
        setUserName(user.displayName);
      }

      // Check if profile exists
      const profileRef = doc(db, "profiles", user.uid);
      const profileSnap = await getDoc(profileRef).catch((err) =>
        handleFirestoreError(err, OperationType.GET, `profiles/${user.uid}`)
      );

      if (profileSnap.exists()) {
        const profileData = profileSnap.data();
        if (profileData.couple_id) {
          // Profile exists and is linked
          onAuthComplete(profileData.couple_id, profileData.name || user.displayName || "웨딩메이트");
        } else {
          // Profile exists but not linked to a couple
          setStep("couple_choice");
        }
      } else {
        // No profile exists, ask for Name
        setStep("profile");
      }
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.message || "로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!userName.trim()) {
      setErrorMessage("이름을 입력해 주세요.");
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      // Just temporarily save name in state and go to couple_choice
      // Profile doc is actually fully written once couple_id is finalized
      setStep("couple_choice");
    } catch (err: any) {
      setErrorMessage("프로필을 저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const generateInviteCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateCouple = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const code = generateInviteCode();
      const coupleId = `${uid}_${Date.now()}`;

      // 1. Create Couple Doc
      const coupleRef = doc(db, "couples", coupleId);
      await setDoc(coupleRef, {
        invite_code: code,
        partner1_id: uid,
        partner2_id: null,
        created_at: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `couples/${coupleId}`));

      // 2. Create/Update Profile Doc
      const profileRef = doc(db, "profiles", uid);
      await setDoc(profileRef, {
        name: userName || "파트너 1",
        couple_id: coupleId,
        created_at: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `profiles/${uid}`));

      setCreatedCode(code);
      setStep("sharing");
    } catch (error: any) {
      setErrorMessage("웨딩 볼트 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinCouple = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== 6) {
      setErrorMessage("6자리 코드를 입력해주세요.");
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      const couplesRef = collection(db, "couples");
      const q = query(couplesRef, where("invite_code", "==", code), where("partner2_id", "==", null));
      const querySnap = await getDocs(q).catch((err) =>
        handleFirestoreError(err, OperationType.LIST, "couples")
      );

      if (querySnap.empty) {
        setErrorMessage("유효한 초대 코드를 찾을 수 없거나 이미 연결 완료된 코드입니다.");
        setLoading(false);
        return;
      }

      const coupleDoc = querySnap.docs[0];
      const coupleId = coupleDoc.id;

      // Update Couple doc to link partner2
      await updateDoc(doc(db, "couples", coupleId), {
        partner2_id: uid,
      }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `couples/${coupleId}`));

      // Create/Update user profile doc
      const profileRef = doc(db, "profiles", uid);
      await setDoc(profileRef, {
        name: userName || "파트너 2",
        couple_id: coupleId,
        created_at: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `profiles/${uid}`));

      onAuthComplete(coupleId, userName || "파트너 2");
    } catch (error: any) {
      setErrorMessage("초대 코드 확인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handlePollConnection = async () => {
    // Manually check if partner2 joined
    setLoading(true);
    setErrorMessage("");
    try {
      const profileRef = doc(db, "profiles", uid);
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        const profileData = profileSnap.data();
        const coupleId = profileData.couple_id;

        const coupleRef = doc(db, "couples", coupleId);
        const coupleSnap = await getDoc(coupleRef);
        if (coupleSnap.exists()) {
          const coupleData = coupleSnap.data();
          if (coupleData.partner2_id) {
            // Partner 2 connected!
            onAuthComplete(coupleId, userName);
          } else {
            setErrorMessage("아직 상대방이 코드를 입력하지 않았습니다.");
          }
        }
      }
    } catch (error: any) {
      setErrorMessage("연결 확인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setStep("login");
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
        <p className="text-sm text-slate-500 text-center mb-8">
          결혼 준비의 모든 계약서와 잔금을 한 번에
        </p>

        {errorMessage && (
          <div className="w-full text-xs text-red-500 bg-red-50 border border-red-100 px-3 py-2.5 rounded-xl mb-4 text-center">
            {errorMessage}
          </div>
        )}

        {step === "login" && (
          <div id="login-section" className="w-full flex flex-col gap-4">
            <p className="text-xs text-slate-400 text-center mb-2 leading-relaxed">
              예비부부 2명이서 함께 계약 내용 및 금액, 실시간 잔금 일정을 공유하고 기록합니다.
            </p>
            <button
              id="google-signin-btn"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full h-12 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all font-medium rounded-xl flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#D4537E]" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  Google 계정으로 계속하기
                </>
              )}
            </button>
          </div>
        )}

        {step === "profile" && (
          <div id="profile-section" className="w-full flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">
                나의 이름 입력
              </label>
              <input
                id="profile-name-input"
                type="text"
                placeholder="예: 민우, 서현"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 outline-none focus:border-[#D4537E] font-medium"
              />
            </div>
            <button
              id="profile-save-btn"
              onClick={handleSaveProfile}
              disabled={loading}
              className="w-full h-12 bg-[#D4537E] text-white hover:bg-[#c2466e] font-medium rounded-xl transition-all active:scale-[0.98] flex items-center justify-center mt-2"
            >
              다음 단계로
            </button>
          </div>
        )}

        {step === "couple_choice" && (
          <div id="couple-choice-section" className="w-full flex flex-col gap-4">
            <p className="text-sm font-semibold text-slate-700 text-center mb-2">
              안녕하세요, {userName}님!<br />커플 보관함을 시작할까요?
            </p>
            <button
              id="create-vault-btn"
              onClick={handleCreateCouple}
              disabled={loading}
              className="w-full h-12 bg-[#D4537E] text-white hover:bg-[#c2466e] font-medium rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "새로 만들기 (초대 코드 생성)"
              )}
            </button>
            <div className="flex items-center my-1">
              <hr className="flex-grow border-slate-100" />
              <span className="px-3 text-xs text-slate-400">또는</span>
              <hr className="flex-grow border-slate-100" />
            </div>
            <button
              id="join-vault-btn"
              onClick={() => setStep("enter_code")}
              className="w-full h-12 bg-white border border-[#D4537E] text-[#D4537E] hover:bg-[#FBEAF0] font-medium rounded-xl transition-all active:scale-[0.98]"
            >
              상대방 초대 코드 입력하기
            </button>
            <button
              id="logout-btn"
              onClick={handleSignOut}
              className="text-xs text-slate-400 mt-4 underline text-center"
            >
              로그아웃
            </button>
          </div>
        )}

        {step === "enter_code" && (
          <div id="enter-code-section" className="w-full flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block flex justify-between">
                <span>파트너의 초대 코드 입력</span>
                <button onClick={() => setStep("couple_choice")} className="text-[#D4537E]">뒤로가기</button>
              </label>
              <div className="relative">
                <input
                  id="invite-code-input"
                  type="text"
                  placeholder="6자리 코드 입력"
                  maxLength={6}
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 outline-none focus:border-[#D4537E] uppercase font-bold tracking-widest text-center"
                />
              </div>
            </div>
            <button
              id="submit-code-btn"
              onClick={handleJoinCouple}
              disabled={loading}
              className="w-full h-12 bg-[#D4537E] text-white hover:bg-[#c2466e] font-medium rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "연결 완료하기"}
            </button>
          </div>
        )}

        {step === "sharing" && (
          <div id="sharing-section" className="w-full flex flex-col items-center gap-4">
            <p className="text-sm font-semibold text-slate-700 text-center">
              초대 코드가 생성되었습니다!
            </p>
            <div className="bg-[#FBEAF0] rounded-2xl py-4 px-6 text-center border border-[#ED93B1]/20 my-2">
              <span id="created-invite-code" className="text-3xl font-extrabold text-[#D4537E] tracking-widest">
                {createdCode}
              </span>
            </div>
            <p className="text-xs text-slate-400 text-center leading-relaxed">
              상대방이 로그인 후 위 코드를 입력하면,<br />
              동일한 보관함을 실시간으로 관리할 수 있습니다.
            </p>

            <button
              id="poll-connection-btn"
              onClick={handlePollConnection}
              disabled={loading}
              className="w-full h-12 bg-[#D4537E] text-white hover:bg-[#c2466e] font-medium rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "상대방 연결 확인"}
            </button>
            <button
              id="back-to-choice-btn"
              onClick={() => setStep("couple_choice")}
              className="text-xs text-[#D4537E] underline text-center font-medium mt-2"
            >
              처음 화면으로 돌아가기
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
