import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, getDoc, collection, query, where, orderBy } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "./lib/firebase";
import { Contract } from "./types";
import AuthPage from "./components/AuthPage";
import Dashboard from "./components/Dashboard";
import ContractList from "./components/ContractList";
import ContractForm from "./components/ContractForm";
import { 
  Heart, Home, FileText, PlusCircle, LogOut, HeartHandshake, Loader2 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profileName, setProfileName] = useState("");
  const [personalName, setPersonalName] = useState("");
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);

  // Navigation state
  const [activeTab, setActiveTab] = useState<"home" | "contracts" | "add">("home");
  
  // Direct details sheet selection
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

  // Sync personal nickname on user change
  useEffect(() => {
    const saved = localStorage.getItem("wedding_user_nickname");
    if (saved) {
      setPersonalName(saved);
    } else {
      setPersonalName("");
    }
  }, [user]);

  // 1. Custom Initialization of Auth State from Local Storage
  useEffect(() => {
    const savedUserStr = localStorage.getItem("wedding_custom_user");
    const savedCoupleId = localStorage.getItem("wedding_couple_id");
    const savedNickname = localStorage.getItem("wedding_user_nickname");

    if (savedUserStr && savedCoupleId) {
      try {
        const parsedUser = JSON.parse(savedUserStr);
        setUser(parsedUser);
        setCoupleId(savedCoupleId);
        setProfileName(savedNickname || parsedUser.displayName || "웨딩메이트");
        
        // Setup real-time listener to user profile just in case it changes
        const profileRef = doc(db, "profiles", parsedUser.uid);
        const unsubProfile = onSnapshot(profileRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setProfileName(data.name || "웨딩메이트");
          }
        }, (err) => {
          console.warn("Failed to listen to profile changes:", err);
        });
        
        setInitializing(false);
        return () => unsubProfile();
      } catch (e) {
        console.error("Failed to parse local stored user:", e);
        localStorage.removeItem("wedding_custom_user");
        localStorage.removeItem("wedding_couple_id");
        setUser(null);
        setCoupleId(null);
        setInitializing(false);
      }
    } else {
      setUser(null);
      setCoupleId(null);
      setInitializing(false);
    }
  }, []);

  // 2. Realtime sync contracts when couple ID is resolved
  useEffect(() => {
    if (!coupleId) {
      setContracts([]);
      return;
    }

    const contractsRef = collection(db, "contracts");
    const q = query(
      contractsRef,
      where("couple_id", "==", coupleId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contractsList: Contract[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        contractsList.push({
          id: docSnap.id,
          ...data,
        } as Contract);
      });

      // Secure client-side sorting by created_at desc to avoid composite index requirements
      contractsList.sort((a, b) => {
        const valA = a.created_at;
        const valB = b.created_at;
        
        let timeA = 0;
        let timeB = 0;
        
        if (valA) {
          if (typeof valA.toDate === "function") {
            timeA = valA.toDate().getTime();
          } else if (valA.seconds) {
            timeA = valA.seconds * 1000;
          } else {
            timeA = new Date(valA).getTime() || 0;
          }
        }
        
        if (valB) {
          if (typeof valB.toDate === "function") {
            timeB = valB.toDate().getTime();
          } else if (valB.seconds) {
            timeB = valB.seconds * 1000;
          } else {
            timeB = new Date(valB).getTime() || 0;
          }
        }
        
        return timeB - timeA;
      });

      setContracts(contractsList);

      // Keep selected contract object in sync with changes from the database snapshot
      if (selectedContract) {
        const updated = contractsList.find((c) => c.id === selectedContract.id);
        if (updated) {
          setSelectedContract(updated);
        } else {
          setSelectedContract(null); // was deleted
        }
      }
    }, (err) => {
      console.warn("contracts list subscription issue:", err);
    });

    return () => unsubscribe();
  }, [coupleId]);

  const handleAuthSuccess = (newCoupleId: string, name: string) => {
    const savedUserStr = localStorage.getItem("wedding_custom_user");
    if (savedUserStr) {
      setUser(JSON.parse(savedUserStr));
    } else {
      setUser({ uid: `user_${name}`, displayName: name });
    }
    setCoupleId(newCoupleId);
    setProfileName(name);
  };

  const handleSignOut = () => {
    if (confirm("웨딩볼트에서 로그아웃 하시겠습니까?")) {
      localStorage.removeItem("wedding_custom_user");
      localStorage.removeItem("wedding_couple_id");
      localStorage.removeItem("wedding_user_nickname");
      localStorage.removeItem("wedding_vault_pwd");
      setUser(null);
      setCoupleId(null);
      setProfileName("");
      setPersonalName("");
      setContracts([]);
    }
  };

  const handleOpenDetailedContract = (c: Contract | null) => {
    setSelectedContract(c);
    // If selected via dashboard timeline link, ensure tab is set to contracts
    if (c && activeTab !== "contracts") {
      setActiveTab("contracts");
    }
  };

  if (initializing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-[#D4537E] mb-3" />
        <span className="text-xs font-semibold tracking-wider text-slate-500">웨딩 볼트 불러오는 중...</span>
      </div>
    );
  }

  if (!user || !coupleId) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-[#F5F5F5] min-h-[600px] flex flex-col justify-center shadow-xl rounded-[32px] overflow-hidden border border-slate-200">
          <header className="h-14 bg-white border-b border-slate-100 px-6 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Heart className="w-5 h-5 text-[#D4537E] fill-current" />
              <h1 className="text-base font-extrabold text-slate-800 tracking-tight">
                WeddingVault
              </h1>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto px-4 py-5">
            <AuthPage onAuthComplete={handleAuthSuccess} />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-850">
      
      {/* 1. Mobile Version (md:hidden) */}
      <div className="md:hidden flex flex-col min-h-screen bg-slate-150">
        <div className="w-full max-w-[420px] mx-auto bg-[#F5F5F5] min-h-screen flex flex-col shadow-xl relative overflow-hidden select-none border-x border-slate-200">
          
          {/* Navigation / Header bar */}
          <header className="h-14 bg-white border-b border-slate-100 px-4 flex items-center justify-between sticky top-0 z-35 flex-shrink-0">
            <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setActiveTab("home")}>
              <Heart className="w-5 h-5 text-[#D4537E] fill-current" />
              <h1 className="text-base font-extrabold text-slate-800 tracking-tight">
                WeddingVault
              </h1>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <HeartHandshake className="w-3.5 h-3.5 text-[#D4537E]" />
                {personalName || profileName || "웨딩메이트"}님
              </span>
              <button
                onClick={handleSignOut}
                className="text-slate-300 hover:text-red-500 transition-colors p-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Content Area */}
          <main className="flex-1 overflow-y-auto px-4 py-5 mb-16">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === "home" && (
                  <Dashboard
                    contracts={contracts}
                    onOpenContract={handleOpenDetailedContract}
                  />
                )}
                {activeTab === "contracts" && (
                  <ContractList
                    contracts={contracts}
                    selectedContract={selectedContract}
                    onOpenContract={handleOpenDetailedContract}
                    uid={user.uid}
                    isDesktop={false}
                  />
                )}
                {activeTab === "add" && (
                  <ContractForm
                    coupleId={coupleId}
                    uid={user.uid}
                    onSuccess={() => {
                      setSelectedContract(null);
                      setActiveTab("contracts");
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Bottom Tab Navigation Bar */}
          <nav className="h-16 bg-white/95 backdrop-blur-md border-t border-slate-100 fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] flex justify-around items-center z-30 px-3 shadow-lg">
            <button
              onClick={() => setActiveTab("home")}
              className={`flex flex-col items-center gap-0.5 cursor-pointer transition-all flex-1 py-1.5 rounded-2xl ${
                activeTab === "home" ? "text-[#D4537E] font-black" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <div className={`p-2 rounded-xl transition-all ${
                activeTab === "home" ? "bg-[#FBEAF0]" : "bg-transparent"
              }`}>
                <Home className="w-5 h-5" />
              </div>
              <span className="text-[10px]">홈</span>
            </button>

            <button
              onClick={() => setActiveTab("contracts")}
              className={`flex flex-col items-center gap-0.5 cursor-pointer transition-all flex-1 py-1.5 rounded-2xl ${
                activeTab === "contracts" ? "text-[#D4537E] font-black" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <div className={`p-2 rounded-xl transition-all ${
                activeTab === "contracts" ? "bg-[#FBEAF0]" : "bg-transparent"
              }`}>
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-[10px]">계약</span>
            </button>

            <button
              onClick={() => setActiveTab("add")}
              className={`flex flex-col items-center gap-0.5 cursor-pointer transition-all flex-1 py-1.5 rounded-2xl ${
                activeTab === "add" ? "text-[#D4537E] font-black" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <div className={`p-2 rounded-xl transition-all ${
                activeTab === "add" ? "bg-[#FBEAF0]" : "bg-transparent"
              }`}>
                <PlusCircle className="w-5 h-5" />
              </div>
              <span className="text-[10px]">추가</span>
            </button>
          </nav>
        </div>
      </div>

      {/* 2. PC / Desktop Version (hidden md:flex) */}
      <div className="hidden md:flex min-h-screen bg-[#F8FAFC]">
        
        {/* PC Sidebar panel */}
        <aside className="w-68 bg-white border-r border-slate-150 flex flex-col justify-between sticky top-0 h-screen select-none z-20 shadow-2xs">
          
          <div className="flex flex-col gap-6 p-6">
            {/* Logo */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab("home")}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#ED93B1] to-[#D4537E] flex items-center justify-center text-white shadow-sm">
                <Heart className="w-5 h-5 fill-current" />
              </div>
              <div>
                <h1 className="text-base font-black text-slate-800 tracking-tight leading-none">
                  WeddingVault
                </h1>
                <span className="text-[9px] text-[#D4537E] font-extrabold uppercase tracking-widest block mt-0.5 font-mono">우리들의 웨딩금고</span>
              </div>
            </div>

            {/* Profile Info Card */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col gap-1.5">
              <span className="text-[10px] text-slate-400 font-bold block">금고 ID 연결 완료</span>
              <div className="flex items-center gap-1.5 font-extrabold text-xs text-slate-700">
                <HeartHandshake className="w-4 h-4 text-[#D4537E]" />
                <span>ID: {coupleId}</span>
              </div>
              <span className="text-[10px] text-[#D4537E] font-black mt-1.5 bg-pink-50 px-2.5 py-1 rounded-full inline-block text-center border border-pink-100">
                {personalName || profileName || "웨딩메이트"}님 접속 중
              </span>
            </div>

            {/* Navigation Menus List */}
            <nav className="flex flex-col gap-1 pt-2">
              <button
                onClick={() => setActiveTab("home")}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-xs font-black transition-all cursor-pointer ${
                  activeTab === "home"
                    ? "bg-[#FBEAF0] text-[#D4537E]"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <Home className="w-4.5 h-4.5" />
                <span>홈 Dashboard</span>
              </button>

              <button
                onClick={() => setActiveTab("contracts")}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-xs font-black transition-all cursor-pointer ${
                  activeTab === "contracts"
                    ? "bg-[#FBEAF0] text-[#D4537E]"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <FileText className="w-4.5 h-4.5" />
                <span>계약서 리스트 ({contracts.length})</span>
              </button>

              <button
                onClick={() => setActiveTab("add")}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-xs font-black transition-all cursor-pointer ${
                  activeTab === "add"
                    ? "bg-[#FBEAF0] text-[#D4537E]"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <PlusCircle className="w-4.5 h-4.5" />
                <span>AI 계약 분석 / 추가 등록</span>
              </button>
            </nav>
          </div>

          {/* Sidebar Footer / Sign-out */}
          <div className="p-6 border-t border-slate-100">
            <button
              onClick={handleSignOut}
              className="w-full h-11 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-500 hover:border-red-100 border border-slate-200/50 rounded-xl text-xs font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>안전하게 로그아웃</span>
            </button>
          </div>
        </aside>

        {/* PC Main Work Space */}
        <div className="flex-1 flex flex-col min-h-screen bg-[#F8FAFC]">
          
          {/* Top header utility bar */}
          <header className="h-16 bg-white border-b border-slate-150 px-8 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <p className="text-xs font-bold text-slate-500">
                💑 우리 결혼 준비 {contracts.length}개의 계약 카드가 실시간 안전 보관 중입니다.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <div className="bg-[#FBEAF0] text-[#D4537E] px-3.5 py-1.5 rounded-xl border border-pink-100/30 text-xs font-extrabold flex items-center gap-1.5">
                <HeartHandshake className="w-4 h-4" />
                로그인: <strong className="text-slate-800 font-black">{personalName || profileName || "웨딩메이트"}님</strong>
              </div>
            </div>
          </header>

          {/* PC Tab Contents body */}
          <main className="flex-1 p-8 max-w-7xl w-full mx-auto overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                {activeTab === "home" && (
                  <Dashboard
                    contracts={contracts}
                    onOpenContract={handleOpenDetailedContract}
                  />
                )}
                {activeTab === "contracts" && (
                  <ContractList
                    contracts={contracts}
                    selectedContract={selectedContract}
                    onOpenContract={handleOpenDetailedContract}
                    uid={user.uid}
                    isDesktop={true}
                  />
                )}
                {activeTab === "add" && (
                  <ContractForm
                    coupleId={coupleId}
                    uid={user.uid}
                    onSuccess={() => {
                      setSelectedContract(null);
                      setActiveTab("contracts");
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

    </div>
  );
}
