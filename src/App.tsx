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

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      {/* 420px Mobile PWA Web Frame Wrapper */}
      <div className="w-full max-w-[420px] bg-[#F5F5F5] min-h-screen flex flex-col shadow-xl relative overflow-hidden select-none border-x border-slate-200">
        
        {/* Navigation / Header bar */}
        <header className="h-14 bg-white border-b border-slate-100 px-4 flex items-center justify-between sticky top-0 z-35 flex-shrink-0">
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setActiveTab("home")}>
            <Heart className="w-5 h-5 text-[#D4537E] fill-current" />
            <h1 className="text-base font-extrabold text-slate-800 tracking-tight">
              WeddingVault
            </h1>
          </div>
          {user && (
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <HeartHandshake className="w-3.5 h-3.5 text-[#D4537E]" />
                {personalName || profileName || "웨딩메이트"}님
              </span>
              <button
                id="signout-header-btn"
                onClick={handleSignOut}
                className="text-slate-300 hover:text-red-500 transition-colors p-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto px-4 py-5 mb-16">
          {!user ? (
            <AuthPage onAuthComplete={handleAuthSuccess} />
          ) : !coupleId ? (
            <AuthPage onAuthComplete={handleAuthSuccess} />
          ) : (
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
          )}
        </main>

        {/* 3-Tab Bottom Navigation Bar */}
        {user && coupleId && (
          <nav className="h-16 bg-white/95 backdrop-blur-md border-t border-slate-100 fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] flex justify-around items-center z-30 px-3 shadow-lg">
            <button
              id="tab-home"
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
              id="tab-contracts"
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
              id="tab-add"
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
        )}
      </div>
    </div>
  );
}
