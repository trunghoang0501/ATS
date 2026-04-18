import * as React from 'react';
import { Component, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  LayoutDashboard, 
  Kanban as KanbanIcon, 
  Upload, 
  User, 
  Mail, 
  Phone, 
  Briefcase, 
  GraduationCap, 
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  LogOut,
  LogIn,
  ChevronRight,
  MoreVertical,
  Search,
  Filter
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  updateDoc, 
  doc, 
  deleteDoc,
  getDocFromServer,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error && parsed.error.includes("insufficient permissions")) {
          message = "You don't have permission to perform this action. Please check your access rights.";
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-4">
            <Trash2 size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Application Error</h2>
          <p className="text-slate-600 mb-6 max-w-md">{message}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { cn } from './lib/utils';
import { extractCandidateInfo, parseDocx, parsePdf } from './services/geminiService';
import { Candidate, ExtractionResult, CandidateStatus } from './types';
import { db, auth, signInWithGoogle, logout } from './firebase';

type Section = 'scanner' | 'pipeline' | 'dashboard';

const STAGES: CandidateStatus[] = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];

const STAGE_COLORS: Record<CandidateStatus, string> = {
  'Applied': 'bg-blue-100 text-blue-700 border-blue-200',
  'Screening': 'bg-amber-100 text-amber-700 border-amber-200',
  'Interview': 'bg-purple-100 text-purple-700 border-purple-200',
  'Offer': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Hired': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Rejected': 'bg-red-100 text-red-700 border-red-200'
};

export default function App() {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  );
}

function AppContent() {
  const [activeSection, setActiveSection] = useState<Section>('scanner');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ExtractionResult | null>(null);
  const [rawText, setRawText] = useState('');
  const [jdText, setJdText] = useState('');
  const [showJdInput, setShowJdInput] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<{ role: string } | null>(null);
  const [viewMode, setViewMode] = useState<'my' | 'all'>('my');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            const isHardcodedAdmin = u.email === 'tracquan26@gmail.com';
            const newUser = {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName,
              photoURL: u.photoURL,
              role: isHardcodedAdmin ? 'admin' : 'recruiter',
              createdAt: new Date().toISOString()
            };
            await setDoc(userRef, newUser);
            setUserProfile({ role: newUser.role });
          } else {
            const data = userDoc.data();
            const isHardcodedAdmin = u.email === 'tracquan26@gmail.com';
            if (isHardcodedAdmin && data.role !== 'admin') {
              await updateDoc(userRef, { role: 'admin' });
              setUserProfile({ role: 'admin' });
            } else {
              setUserProfile({ role: data.role });
            }
          }
        } catch (err) {
          console.error("Error syncing user profile:", err);
          setUserProfile({ role: 'recruiter' }); // Fallback
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Sign in error:", err);
      if (err.code === 'auth/popup-blocked') {
        setError("Sign-in popup was blocked by your browser. Please allow popups for this site.");
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Ignore, user closed the popup or another one was opened
      } else {
        setError("Failed to sign in with Google. Please try again.");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Firestore Listener
  useEffect(() => {
    if (!user) {
      setCandidates([]);
      return;
    }

    const path = 'candidates';
    const isAdmin = userProfile?.role === 'admin';
    const q = (isAdmin && viewMode === 'all') 
      ? query(collection(db, path))
      : query(collection(db, path), where('uid', '==', user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Candidate[];
      setCandidates(docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (err) => {
      // If permission denied on 'all' view, fallback to 'my' view
      if (err.code === 'permission-denied' && viewMode === 'all') {
        setViewMode('my');
      } else {
        handleFirestoreError(err, OperationType.GET, path);
      }
    });

    return () => unsubscribe();
  }, [user, userProfile, viewMode]);

  // Removed connection test

  const handleScan = async (text: string) => {
    if (!text.trim()) return;
    setIsScanning(true);
    setError(null);
    
    // Truncate text if it's extremely long to avoid token limit issues
    const truncatedText = text.length > 30000 ? text.substring(0, 30000) + "..." : text;
    
    try {
      const result = await extractCandidateInfo(truncatedText, undefined, jdText.trim() || undefined);
      setScanResult(result);
    } catch (err: any) {
      console.error('Scanning failed:', err);
      setError(err.message || "Failed to analyze CV. Please try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const parseFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      if (file.type === 'application/pdf') {
        reader.onload = async (e) => {
          try {
            const text = await parsePdf(e.target?.result as ArrayBuffer);
            resolve(text);
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        reader.onload = async (e) => {
          try {
            const text = await parseDocx(e.target?.result as ArrayBuffer);
            resolve(text);
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(file);
      }
    });
  };

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setError(null);
      try {
        const text = await parseFile(file);
        setRawText(text);
        handleScan(text);
      } catch (err: any) {
        console.error("File parsing error:", err);
        setError(err.message || "Failed to parse file.");
      }
    }
  };

  const onJdUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      setError(null);
      try {
        const text = await parseFile(file);
        setJdText(text);
      } catch (err: any) {
        console.error("JD parsing error:", err);
        setError(err.message || "Failed to parse JD file.");
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc']
    },
    multiple: false
  } as any);

  const addCandidate = async () => {
    if (!scanResult || !user) return;
    const path = 'candidates';
    try {
      const newCandidate = {
        ...scanResult,
        status: 'Applied' as CandidateStatus,
        createdAt: new Date().toISOString(),
        rawText: rawText,
        uid: user.uid
      };
      await addDoc(collection(db, path), newCandidate);
      setScanResult(null);
      setRawText('');
      setActiveSection('pipeline');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const updateCandidateStatus = async (id: string, newStatus: CandidateStatus) => {
    const path = `candidates/${id}`;
    try {
      await updateDoc(doc(db, 'candidates', id), { status: newStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const moveCandidate = async (id: string, currentStatus: CandidateStatus) => {
    const currentIndex = STAGES.indexOf(currentStatus);
    if (currentIndex < STAGES.length - 2) { // Don't move past Hired or into Rejected
      const nextStatus = STAGES[currentIndex + 1];
      const path = `candidates/${id}`;
      try {
        await updateDoc(doc(db, 'candidates', id), { status: nextStatus });
        if (nextStatus === 'Hired') {
          // Use a custom modal or toast instead of alert in a real app, 
          // but for now we'll keep it simple as per instructions (avoid alert/confirm if possible)
          console.log("Candidate marked as Hired");
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  const rejectCandidate = async (id: string) => {
    const path = `candidates/${id}`;
    try {
      await updateDoc(doc(db, 'candidates', id), { status: 'Rejected' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const deleteCandidate = async (id: string) => {
    const path = `candidates/${id}`;
    try {
      await deleteDoc(doc(db, 'candidates', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => 
      c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.keySkills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [candidates, searchQuery]);

  const dashboardData = useMemo(() => {
    return STAGES.map(stage => ({
      name: stage,
      count: candidates.filter(c => c.status === stage).length
    }));
  }, [candidates]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-12 rounded-[40px] shadow-2xl shadow-indigo-100 border border-slate-100 text-center max-w-md w-full"
        >
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-indigo-200 mx-auto mb-8">
            <Briefcase size={40} />
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-4">TalentFlow</h1>
          <p className="text-slate-500 mb-10 text-lg">Your intelligent recruitment companion. Sign in to manage your pipeline.</p>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
              {error}
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="w-full py-5 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all duration-300 shadow-xl shadow-slate-200 group disabled:opacity-70"
          >
            {isSigningIn ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <LogIn size={24} className="group-hover:translate-x-1 transition-transform" />
            )}
            {isSigningIn ? "Signing in..." : "Sign in with Google"}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 p-6 flex flex-col gap-8 z-10">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Briefcase size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">TalentFlow</h1>
        </div>

        <nav className="flex flex-col gap-2">
          <button
            onClick={() => setActiveSection('scanner')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
              activeSection === 'scanner' 
                ? "bg-indigo-50 text-indigo-700 font-medium shadow-sm" 
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            )}
          >
            <FileText size={20} />
            CV Scanner
          </button>
          <button
            onClick={() => setActiveSection('pipeline')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
              activeSection === 'pipeline' 
                ? "bg-indigo-50 text-indigo-700 font-medium shadow-sm" 
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            )}
          >
            <KanbanIcon size={20} />
            Pipeline
          </button>
          <button
            onClick={() => setActiveSection('dashboard')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
              activeSection === 'dashboard' 
                ? "bg-indigo-50 text-indigo-700 font-medium shadow-sm" 
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            )}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </button>
        </nav>

        {userProfile?.role === 'admin' && (
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4">Admin Controls</h3>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('my')}
                className={cn(
                  "flex-1 text-[10px] font-bold py-2 rounded-lg transition-all",
                  viewMode === 'my' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                My Data
              </button>
              <button
                onClick={() => setViewMode('all')}
                className={cn(
                  "flex-1 text-[10px] font-bold py-2 rounded-lg transition-all",
                  viewMode === 'all' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                All Data
              </button>
            </div>
          </div>
        )}

        <div className="mt-auto space-y-4">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" referrerPolicy="no-referrer" />
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-slate-800 truncate">{user.displayName}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <button 
              onClick={logout}
              className="w-full py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-10 mx-auto transition-all duration-300 max-w-full">
        <AnimatePresence mode="wait">
          {activeSection === 'scanner' && (
            <motion.div
              key="scanner"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">CV Scanner</h2>
                <p className="text-slate-500 mt-2">Upload or paste candidate details to extract information automatically.</p>
              </header>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="font-bold">!</span>
                  </div>
                  <p className="text-sm font-medium">{error}</p>
                  <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 font-bold text-lg">×</button>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Input Section */}
                <div className="space-y-6">
                  <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider block">Job Comparison</h3>
                      <button 
                        onClick={() => setShowJdInput(!showJdInput)}
                        className={cn(
                          "text-[10px] font-bold px-2 py-1 rounded-md transition-all flex items-center gap-1",
                          showJdInput ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                      >
                        <FileText size={12} />
                        {showJdInput ? "Hide JD" : "Add JD for Comparison"}
                      </button>
                    </div>

                    {showJdInput ? (
                      <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Job Description (JD)</label>
                          <div className="flex gap-2">
                            <label className="cursor-pointer text-[10px] text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1">
                              <Upload size={10} />
                              Upload JD File
                              <input type="file" className="hidden" onChange={onJdUpload} accept=".txt,.pdf,.doc,.docx" />
                            </label>
                            <button 
                              onClick={() => setJdText('')}
                              className="text-[10px] text-red-500 hover:text-red-600 font-bold"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={jdText}
                          onChange={(e) => setJdText(e.target.value)}
                          placeholder="Paste the company's job description here for a more accurate match..."
                          className="w-full h-32 p-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all resize-none text-xs bg-slate-50/50"
                        />
                      </div>
                    ) : (
                      <div className="mb-4 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                        <p className="text-xs text-slate-400">Optional: Add a Job Description for more accurate AI matching and scoring.</p>
                      </div>
                    )}
                    
                    <div 
                      {...getRootProps()} 
                      className={cn(
                        "border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 cursor-pointer group",
                        isDragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50"
                      )}
                    >
                      <input {...getInputProps()} />
                      <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                        <Upload size={24} />
                      </div>
                      <p className="text-base font-medium text-slate-700">Drop CV here or click to upload</p>
                      <p className="text-xs text-slate-400 mt-1">Supports .txt, .pdf, .doc, .docx files</p>
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-slate-200"></span>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-slate-50 px-4 text-slate-400 font-semibold tracking-widest">Or paste text</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Resume Text</label>
                      <button 
                        onClick={() => setRawText("John Doe\nEmail: john.doe@example.com\nPhone: +1 234 567 890\nExperience: 5 years as a Senior Frontend Developer at TechCorp.\nSkills: React, TypeScript, Tailwind CSS, Node.js.\nEducation: Bachelor of Science in Computer Science.")}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-bold"
                      >
                        Load Sample
                      </button>
                    </div>
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder="Paste resume text here..."
                      className="w-full h-48 p-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all duration-200 resize-none bg-white shadow-sm text-sm"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setRawText('');
                          setScanResult(null);
                        }}
                        className="px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all duration-200"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => handleScan(rawText)}
                        disabled={isScanning || !rawText.trim()}
                        className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
                      >
                        {isScanning ? (
                          <>
                            <Loader2 className="animate-spin" size={20} />
                            Analyzing CV...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={20} />
                            Extract Information
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Result Section */}
                <div className="space-y-6">
                  <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm h-fit sticky top-10">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <User className="text-indigo-600" size={20} />
                        Extracted Details
                      </h3>
                      {scanResult && jdText.trim() && (
                        <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider rounded-md border border-indigo-100 flex items-center gap-1">
                          <FileText size={10} />
                          Compared with JD
                        </span>
                      )}
                    </div>

                    {scanResult ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-200">
                          <div>
                            <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest mb-0.5">Match Score</p>
                            <h4 className="text-3xl font-black">{scanResult.matchScore}%</h4>
                          </div>
                          <div className="w-12 h-12 rounded-full border-2 border-indigo-400 flex items-center justify-center">
                            <CheckCircle2 size={24} />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                              <User size={16} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Full Name</p>
                              <p className="text-base font-semibold text-slate-800">{scanResult.fullName || 'Not found'}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                              <Mail size={16} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Email Address</p>
                              <p className="text-base font-semibold text-slate-800 truncate max-w-[180px]">{scanResult.email || 'Not found'}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                              <Phone size={16} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Phone Number</p>
                              <p className="text-base font-semibold text-slate-800">{scanResult.phone || 'Not found'}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                              <Briefcase size={16} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Target Position</p>
                              <p className="text-base font-semibold text-slate-800">{scanResult.jobPosition || 'Not specified'}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                              <Briefcase size={16} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Experience</p>
                              <p className="text-base font-semibold text-slate-800">{scanResult.yearsOfExperience} Years</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                              <GraduationCap size={16} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Education</p>
                              <p className="text-base font-semibold text-slate-800 truncate max-w-[180px]">{scanResult.educationLevel || 'Not found'}</p>
                            </div>
                          </div>

                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Professional Summary</p>
                            <p className="text-xs text-slate-600 leading-relaxed italic">"{scanResult.summary}"</p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2">Key Strengths</p>
                              <ul className="space-y-1">
                                {scanResult.strengths.map((s, i) => (
                                  <li key={i} className="text-[10px] text-emerald-700 flex items-start gap-1.5">
                                    <div className="w-1 h-1 bg-emerald-400 rounded-full mt-1 shrink-0" />
                                    <span>{s}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="p-3 bg-red-50/50 rounded-xl border border-red-100">
                              <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-2">Potential Gaps</p>
                              <ul className="space-y-1">
                                {scanResult.weaknesses.map((w, i) => (
                                  <li key={i} className="text-[10px] text-red-700 flex items-start gap-1.5">
                                    <div className="w-1 h-1 bg-red-400 rounded-full mt-1 shrink-0" />
                                    <span>{w}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Key Skills</p>
                            <div className="flex flex-wrap gap-1.5">
                              {scanResult.keySkills.length > 0 ? (
                                scanResult.keySkills.slice(0, 8).map((skill, i) => (
                                  <span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[10px] font-medium border border-indigo-100">
                                    {skill}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">No skills detected</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={addCandidate}
                          className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-all duration-200 flex items-center justify-center gap-2 mt-2 shadow-xl shadow-slate-200 text-sm"
                        >
                          <Plus size={18} />
                          Add to Pipeline
                        </button>
                      </div>
                    ) : (
                      <div className="py-12 text-center space-y-3">
                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto">
                          <FileText size={24} />
                        </div>
                        <p className="text-slate-400 text-xs max-w-[180px] mx-auto">Scan a CV to see extracted information here.</p>
                      </div>
                    )}
                  </div>

                  {candidates.length > 0 && (
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                      <h3 className="text-base font-bold text-slate-800 mb-3">Recent Candidates</h3>
                      <div className="space-y-2">
                        {candidates.slice(-3).reverse().map((c) => (
                          <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-indigo-600 border border-slate-200 font-bold text-xs shrink-0">
                                {c.fullName.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 text-xs truncate">{c.fullName}</p>
                                <p className="text-[10px] text-slate-500 truncate">{c.email}</p>
                              </div>
                            </div>
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[8px] font-bold uppercase tracking-wider rounded shrink-0">
                              {c.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'pipeline' && (
            <motion.div
              key="pipeline"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <header className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Recruitment Pipeline</h2>
                  <p className="text-slate-500 mt-2">Manage your candidates across different stages of recruitment.</p>
                </div>
                <div className="flex gap-4">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search candidates..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all w-64 shadow-sm"
                    />
                  </div>
                </div>
              </header>

              <div className="flex gap-4 min-h-[70vh]">
                {STAGES.map(stage => (
                  <div key={stage} className="flex-1 min-w-0 flex flex-col gap-4">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="font-bold text-slate-700 text-sm truncate">{stage}</h3>
                        <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                          {filteredCandidates.filter(c => c.status === stage).length}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 bg-slate-100/50 rounded-[32px] p-4 space-y-4 border border-slate-200/50">
                      {filteredCandidates.filter(c => c.status === stage).map(candidate => (
                        <motion.div
                          layoutId={candidate.id}
                          key={candidate.id}
                          className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 group hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer relative"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 font-bold border border-indigo-100 text-xs shrink-0">
                              {candidate.fullName.charAt(0)}
                            </div>
                            <div className="flex flex-col items-end gap-1 min-w-0">
                              <span className={cn(
                                "text-[9px] font-black px-1.5 py-0.5 rounded-md truncate max-w-full",
                                candidate.matchScore >= 70 ? "bg-emerald-100 text-emerald-700" :
                                candidate.matchScore >= 50 ? "bg-amber-100 text-amber-700" :
                                "bg-red-100 text-red-700"
                              )}>
                                {candidate.matchScore}%
                              </span>
                            </div>
                          </div>
                          
                          <h4 className="font-bold text-slate-800 text-[11px] mb-0.5 truncate">{candidate.fullName}</h4>
                          <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider mb-1 truncate">{candidate.jobPosition}</p>
                          
                          <div className="flex items-center gap-1 text-[9px] text-slate-400 mb-2">
                            <Briefcase size={10} />
                            <span className="truncate">{candidate.yearsOfExperience}y • {candidate.educationLevel}</span>
                          </div>

                          <div className="flex gap-1.5">
                            {candidate.status !== 'Hired' && candidate.status !== 'Rejected' && (
                              <>
                                <button 
                                  onClick={() => moveCandidate(candidate.id, candidate.status)}
                                  className="flex-1 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-0.5"
                                >
                                  Next <ChevronRight size={12} />
                                </button>
                                <button 
                                  onClick={() => rejectCandidate(candidate.id)}
                                  className="p-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold hover:bg-red-600 hover:text-white transition-all"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </motion.div>
                      ))}
                      
                      {filteredCandidates.filter(c => c.status === stage).length === 0 && (
                        <div className="py-12 text-center text-slate-300 border-2 border-dashed border-slate-200 rounded-2xl">
                          <p className="text-xs font-medium">No candidates</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeSection === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <header className="flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Recruitment Dashboard</h2>
                  <p className="text-slate-500 mt-2">Real-time insights into your hiring process.</p>
                </div>
                <button 
                  onClick={() => {
                    const csv = [
                      ['Name', 'Email', 'Position', 'Experience', 'Education', 'Match Score', 'Status', 'Created At'],
                      ...candidates.map(c => [
                        c.fullName,
                        c.email,
                        c.jobPosition,
                        c.yearsOfExperience,
                        c.educationLevel,
                        c.matchScore,
                        c.status,
                        c.createdAt
                      ])
                    ].map(row => row.join(',')).join('\n');
                    
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `recruitment_report_${new Date().toISOString().split('T')[0]}.csv`;
                    a.click();
                  }}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
                >
                  Export CSV
                </button>
              </header>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Total Candidates', value: candidates.length, color: 'bg-blue-50 text-blue-600' },
                  { label: 'Active in Pipeline', value: candidates.filter(c => c.status !== 'Hired' && c.status !== 'Rejected').length, color: 'bg-amber-50 text-amber-600' },
                  { label: 'Hired This Month', value: candidates.filter(c => c.status === 'Hired' && new Date(c.createdAt).getMonth() === new Date().getMonth()).length, color: 'bg-emerald-50 text-emerald-600' },
                  { label: 'Avg Match Score', value: candidates.length ? Math.round(candidates.reduce((acc, c) => acc + c.matchScore, 0) / candidates.length) + '%' : '0%', color: 'bg-indigo-50 text-indigo-600' }
                ].map((kpi, i) => (
                  <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">{kpi.label}</p>
                    <h3 className={cn("text-3xl font-black", kpi.color.split(' ')[1])}>{kpi.value}</h3>
                  </div>
                ))}
              </div> {/* Charts Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-base font-bold text-slate-800 mb-4">Candidates per Stage</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={STAGES.map(stage => ({
                        name: stage,
                        count: candidates.filter(c => c.status === stage).length
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                          cursor={{ fill: '#f8fafc' }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {STAGES.map((stage, index) => (
                            <Cell key={index} fill={
                              stage === 'Hired' ? '#6366f1' : 
                              stage === 'Rejected' ? '#ef4444' : 
                              '#94a3b8'
                            } />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-base font-bold text-slate-800 mb-4">Candidates by Position</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Array.from(new Set(candidates.map(c => c.jobPosition))).map(pos => ({
                            name: pos,
                            value: candidates.filter(c => c.jobPosition === pos).length
                          }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {Array.from(new Set(candidates.map(c => c.jobPosition))).map((_, index) => (
                            <Cell key={index} fill={['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b'][index % 5]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-base font-bold text-slate-800 mb-4">Candidates Added per Week</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(() => {
                        const weeks: Record<string, number> = {};
                        candidates.forEach(c => {
                          const date = new Date(c.createdAt);
                          const week = `W${Math.ceil(date.getDate() / 7)}`;
                          weeks[week] = (weeks[week] || 0) + 1;
                        });
                        return Object.entries(weeks).map(([name, count]) => ({ name, count }));
                      })()}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }} />
                        <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
