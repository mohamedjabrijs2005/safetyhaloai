
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Activity, 
  Thermometer, 
  Wind, 
  Flame, 
  Volume2, 
  History,
  Info,
  Zap,
  LayoutDashboard,
  Bell,
  Settings,
  AlertTriangle,
  VolumeX,
  Volume2 as VolumeIcon,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Lock,
  ArrowRight,
  ExternalLink,
  Cpu,
  Fingerprint,
  LogOut,
  BrainCircuit,
  Microchip,
  Download,
  Target
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

import { 
  SafetyStatus, 
  MLState, 
  SensorData, 
  RoomContext, 
  GeminiSafetyReport,
  LogEntry
} from './types';
import { analyzeSafetyContext } from './services/geminiService';
import SensorMetric from './components/SensorMetric';
import SafetyRadar from './components/SafetyRadar';

const LOCAL_STORAGE_KEY = 'safety_halo_logs';
const SETTINGS_KEY = 'safety_halo_settings';

// Initial Mock State
const INITIAL_SENSORS: SensorData = {
  motion_events_last_15min: 42,
  avg_temperature_c: 24.5,
  avg_humidity: 45,
  gas_level: 0.12,
  smoke_level: 0.05,
  noise_level: 0.2,
  door_open: false
};

const SCENARIOS = {
  NORMAL: {
    ml_state: MLState.NORMAL,
    sensors: { ...INITIAL_SENSORS },
    notes: "Regular activity detected."
  },
  FALL: {
    ml_state: MLState.FALL_LIKELY,
    sensors: { ...INITIAL_SENSORS, motion_events_last_15min: 120, noise_level: 0.8 },
    notes: "Sudden spike in noise and motion followed by silence."
  },
  GAS_LEAK: {
    ml_state: MLState.GAS_SMOKE_ALERT,
    sensors: { ...INITIAL_SENSORS, gas_level: 0.85, smoke_level: 0.1 },
    notes: "High gas readings detected near kitchen area."
  },
  FIRE: {
    ml_state: MLState.GAS_SMOKE_ALERT,
    sensors: { ...INITIAL_SENSORS, smoke_level: 0.9, avg_temperature_c: 45.2 },
    notes: "Smoke and rapid temperature increase."
  },
  INACTIVE: {
    ml_state: MLState.NO_MOVEMENT,
    sensors: { ...INITIAL_SENSORS, motion_events_last_15min: 0 },
    notes: "No movement for extended period at night."
  },
  LOUD_NOISE: {
    ml_state: MLState.LOUD_NOISE,
    sensors: { ...INITIAL_SENSORS, noise_level: 0.95 },
    notes: "Sustained high decibel levels detected."
  }
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'info'>('dashboard');
  const [sensors, setSensors] = useState<SensorData>(INITIAL_SENSORS);
  const [mlState, setMlState] = useState<MLState>(MLState.NORMAL);
  const [mlConfidence, setMlConfidence] = useState(0.98);
  const [safetyReport, setSafetyReport] = useState<GeminiSafetyReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? JSON.parse(saved).alertsEnabled : true;
  });

  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? JSON.parse(saved).confidenceThreshold : 0.75;
  });
  
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const savedLogs = localStorage.getItem(LOCAL_STORAGE_KEY);
    return savedLogs ? JSON.parse(savedLogs) : [];
  });

  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ alertsEnabled, confidenceThreshold }));
  }, [alertsEnabled, confidenceThreshold]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs));
  }, [logs]);

  const playAlertSound = useCallback((status: SafetyStatus) => {
    if (!alertsEnabled) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const playBeep = (freq: number, duration: number, startTime: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.1, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    if (status === SafetyStatus.DANGER) {
      for (let i = 0; i < 3; i++) playBeep(880, 0.2, now + (i * 0.25));
    } else if (status === SafetyStatus.WARNING) {
      playBeep(440, 0.4, now);
      playBeep(440, 0.4, now + 0.6);
    }
  }, [alertsEnabled]);

  useEffect(() => {
    const interval = setInterval(() => {
      setHistory(prev => {
        const newData = [...prev, {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          temp: sensors.avg_temperature_c + (Math.random() - 0.5),
          gas: sensors.gas_level + (Math.random() * 0.02),
          noise: sensors.noise_level + (Math.random() * 0.1)
        }].slice(-20);
        return newData;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [sensors]);

  const runAnalysis = useCallback(async (currentContext: RoomContext) => {
    setIsAnalyzing(true);
    const report = await analyzeSafetyContext(currentContext);
    setSafetyReport(report);
    setIsAnalyzing(false);

    if (report.status === SafetyStatus.WARNING || report.status === SafetyStatus.DANGER) {
      playAlertSound(report.status);
    }

    setLogs(prev => {
      const newLog: LogEntry = {
        timestamp: new Date().toLocaleString(),
        status: report.status,
        ml_state: currentContext.ml_state,
        sensor_summary: `T: ${currentContext.sensors.avg_temperature_c.toFixed(1)}°C | G: ${(currentContext.sensors.gas_level * 100).toFixed(0)}% | N: ${(currentContext.sensors.noise_level * 100).toFixed(0)}% | M: ${currentContext.sensors.motion_events_last_15min}`
      };
      return [newLog, ...prev].slice(0, 100);
    });
  }, [playAlertSound]);

  const triggerScenario = (key: keyof typeof SCENARIOS) => {
    const scenario = SCENARIOS[key];
    const generatedConfidence = 0.65 + Math.random() * 0.35; // Varied confidence
    
    setSensors(scenario.sensors);
    setMlState(scenario.ml_state);
    setMlConfidence(generatedConfidence);
    
    if (generatedConfidence < confidenceThreshold) {
      setSafetyReport({
        status: SafetyStatus.SAFE,
        summary: `ML Confidence (${(generatedConfidence * 100).toFixed(0)}%) is below threshold (${(confidenceThreshold * 100).toFixed(0)}%). AI Analysis skipped to prevent inaccuracies.`,
        actions_for_user: ["Monitor sensors manually.", "Recalibrate edge model."],
        actions_for_warden: ["None needed."]
      });
      return;
    }

    const context: RoomContext = {
      room_id: "HOSTEL_A_204",
      time: new Date().toISOString(),
      ml_state: scenario.ml_state,
      ml_confidence: generatedConfidence,
      sensors: scenario.sensors,
      expected_occupancy: "occupied_at_night",
      notes: scenario.notes
    };
    
    runAnalysis(context);
  };

  const handleClearLogs = () => {
    if (window.confirm('Clear all safety event history?')) {
      setLogs([]);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  };

  const handleExportLogs = () => {
    if (logs.length === 0) return;
    const headers = ['Timestamp', 'ML State', 'AI Assessment', 'Sensor Snapshot'];
    const csvContent = [
      headers.join(','),
      ...logs.map(log => `"${log.timestamp}","${log.ml_state}","${log.status}","${log.sensor_summary.replace(/"/g, '""')}"`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `safety_halo_logs_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (isAuthenticated) {
      const initialContext: RoomContext = {
        room_id: "HOSTEL_A_204",
        time: new Date().toISOString(),
        ml_state: MLState.NORMAL,
        ml_confidence: 0.98,
        sensors: INITIAL_SENSORS,
        expected_occupancy: "occupied_at_night",
        notes: "System initialization."
      };
      runAnalysis(initialContext);
    }
  }, [isAuthenticated, runAnalysis]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 lg:p-12 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-900 to-slate-900">
        <div className="w-full max-w-6xl flex flex-col lg:flex-row items-stretch gap-8 animate-in fade-in zoom-in duration-700">
          
          <div className="flex-1 lg:pr-12 flex flex-col justify-center space-y-8 order-2 lg:order-1">
            <div className="space-y-4">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-widest">
                <BrainCircuit size={14} />
                <span>Next-Gen IoT Security</span>
              </div>
              <h1 className="text-4xl lg:text-6xl font-black text-white tracking-tight leading-tight">
                AI Context-Aware <br/><span className="text-indigo-500">Safety Halo</span>
              </h1>
              <p className="text-slate-400 text-lg leading-relaxed max-w-lg">
                Fusing real-time sensor streams with Google's Gemini reasoning to protect homes, PGs, and hostels from indoor hazards.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex items-start space-x-4">
                <div className="bg-white/5 p-3 rounded-2xl text-indigo-400 border border-white/5">
                  <Microchip size={24} />
                </div>
                <div>
                  <h3 className="text-white font-bold mb-1">Sensor Fusion</h3>
                  <p className="text-slate-500 text-sm">Motion, gas, posture, and sound patterns analyzed simultaneously.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <div className="bg-white/5 p-3 rounded-2xl text-indigo-400 border border-white/5">
                  <Zap size={24} />
                </div>
                <div>
                  <h3 className="text-white font-bold mb-1">Explainable AI</h3>
                  <p className="text-slate-500 text-sm">Powered by Gemini 3 to describe incidents in natural language.</p>
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-white/5">
              <div className="flex items-center space-x-4">
                <ShieldCheck className="text-emerald-500" size={20} />
                <span className="text-slate-400 text-sm font-medium">Protecting 2,400+ rooms across campus networks.</span>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[450px] order-1 lg:order-2">
            <div className="bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 lg:p-10 shadow-2xl relative overflow-hidden group">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl transition-all group-hover:bg-indigo-600/30"></div>
              
              <div className="relative z-10">
                <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mb-8 shadow-2xl shadow-indigo-500/40">
                  <Activity className="text-white" size={32} />
                </div>
                
                <h2 className="text-3xl font-black text-white tracking-tight mb-2">Access Portal</h2>
                <p className="text-slate-500 mb-10">Sign in to monitor room safety context.</p>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Access Key ID</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                        <Fingerprint size={18} />
                      </div>
                      <input 
                        type="text" 
                        placeholder="e.g. WARDEN_A_204"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all focus:bg-white/10"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Security Pin</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                        <Lock size={18} />
                      </div>
                      <input 
                        type="password" 
                        placeholder="e.g. 123456"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all focus:bg-white/10"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={() => setIsAuthenticated(true)}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-5 rounded-2xl shadow-xl shadow-indigo-500/30 flex items-center justify-center space-x-3 transition-all transform active:scale-[0.98]"
                  >
                    <span>Connect Safety Hub</span>
                    <ArrowRight size={20} />
                  </button>
                </div>
                
                <div className="mt-12 text-center">
                  <p className="text-sm text-slate-600 font-bold uppercase tracking-widest">
                    All rights reserved @2025
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 text-slate-900 pb-20 lg:pb-0">
      <aside className="w-64 bg-white border-r border-slate-200 hidden lg:flex flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-slate-100 flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Activity size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">SafetyHalo</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center space-x-3 w-full p-3 rounded-xl font-semibold transition-all ${
              activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('info')}
            className={`flex items-center space-x-3 w-full p-3 rounded-xl font-semibold transition-all ${
              activeTab === 'info' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Info size={20} />
            <span>System Info</span>
          </button>
          
          <div className="pt-4 pb-2 px-3 space-y-4">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Global Config</p>
            
            <button 
              onClick={() => setAlertsEnabled(!alertsEnabled)}
              className={`flex items-center justify-between w-full p-3 rounded-xl transition-all ${
                alertsEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'
              }`}
            >
              <div className="flex items-center space-x-3">
                {alertsEnabled ? <VolumeIcon size={18} /> : <VolumeX size={18} />}
                <span className="text-sm font-medium">Audible Alarms</span>
              </div>
              <div className={`w-8 h-4 rounded-full relative transition-colors ${alertsEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${alertsEnabled ? 'left-4.5' : 'left-0.5'}`} />
              </div>
            </button>

            <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-500">
                  <Target size={14} />
                  <span className="text-[10px] font-bold uppercase">Confidence Gate</span>
                </div>
                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 rounded">{(confidenceThreshold * 100).toFixed(0)}%</span>
              </div>
              <input 
                type="range" 
                min="0.1" 
                max="0.99" 
                step="0.01" 
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <p className="text-[9px] text-slate-400 leading-tight">AI analysis only triggers if edge model confidence meets this value.</p>
            </div>
          </div>
        </nav>

        <div className="p-4 mt-auto">
          <button 
            onClick={() => setIsAuthenticated(false)}
            className="w-full mb-4 flex items-center justify-center space-x-2 py-3 border border-slate-200 rounded-xl text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 font-bold uppercase transition-all"
          >
            <LogOut size={14} />
            <span>Logout Session</span>
          </button>
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-2xl text-white">
            <p className="text-xs font-medium opacity-80 uppercase mb-1">AI Engine</p>
            <p className="text-sm font-bold mb-3">Gemini 3 Flash</p>
            <div className="flex items-center space-x-2 bg-white bg-opacity-20 p-2 rounded-lg backdrop-blur-sm">
              <Zap size={14} />
              <span className="text-xs font-medium">System Online</span>
            </div>
          </div>
        </div>
      </aside>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 flex items-center justify-around p-3 shadow-lg">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center space-y-1 transition-colors ${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <LayoutDashboard size={24} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Dashboard</span>
        </button>
        <button 
          onClick={() => setActiveTab('info')}
          className={`flex flex-col items-center space-y-1 transition-colors ${activeTab === 'info' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <Info size={24} />
          <span className="text-[10px] font-bold uppercase tracking-wider">System Info</span>
        </button>
        <button 
          onClick={() => setAlertsEnabled(!alertsEnabled)}
          className={`flex flex-col items-center space-y-1 transition-colors ${alertsEnabled ? 'text-emerald-600' : 'text-slate-400'}`}
        >
          {alertsEnabled ? <VolumeIcon size={24} /> : <VolumeX size={24} />}
          <span className="text-[10px] font-bold uppercase tracking-wider">Alerts</span>
        </button>
        <button 
          onClick={() => setIsAuthenticated(false)}
          className="flex flex-col items-center space-y-1 text-slate-400"
        >
          <LogOut size={24} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Exit</span>
        </button>
      </nav>

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-30 bg-slate-50 bg-opacity-80 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="lg:hidden bg-indigo-600 p-2 rounded-lg text-white">
              <Activity size={20} />
            </div>
            <div>
              <h2 className="text-[10px] lg:text-sm font-medium text-slate-400">Hostel A • Room 204</h2>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-sm lg:text-lg font-bold">
                  {activeTab === 'dashboard' ? 'Smart Monitor' : 'System Info'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
             <div className="bg-white border border-slate-200 rounded-full px-3 lg:px-4 py-1 flex items-center space-x-2 shadow-sm text-[10px] lg:text-sm">
                <span className="text-slate-500 hidden sm:inline">ML Threshold:</span>
                <span className="font-bold text-indigo-600">{(confidenceThreshold * 100).toFixed(0)}%</span>
             </div>
          </div>
        </header>

        <div className="p-4 lg:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-7xl mx-auto">
          {activeTab === 'dashboard' ? (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg lg:text-xl font-bold flex items-center space-x-2">
                      <Zap className="text-amber-500" size={20} />
                      <span>Context Simulation</span>
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    {Object.keys(SCENARIOS).map((key) => (
                      <button 
                        key={key}
                        onClick={() => triggerScenario(key as keyof typeof SCENARIOS)}
                        className="bg-white p-3 lg:p-4 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all text-center group"
                      >
                        <div className="p-2 rounded-xl bg-slate-50 group-hover:bg-indigo-50 mb-2 transition-colors">
                          <Activity className={`mx-auto text-slate-400 group-hover:text-indigo-500`} size={20} />
                        </div>
                        <span className="text-[10px] font-bold block capitalize leading-tight">{key.toLowerCase().replace('_', ' ')}</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <SensorMetric label="Motion" value={sensors.motion_events_last_15min} unit="evt" icon={<Activity size={20} />} color="bg-blue-500" />
                    <SensorMetric label="Temp" value={sensors.avg_temperature_c.toFixed(1)} unit="°C" icon={<Thermometer size={20} />} color="bg-orange-500" />
                    <SensorMetric label="Gas" value={(sensors.gas_level * 100).toFixed(0)} unit="%" icon={<Wind size={20} />} color="bg-purple-500" />
                    <SensorMetric label="Noise" value={(sensors.noise_level * 100).toFixed(0)} unit="dB" icon={<Volume2 size={20} />} color="bg-pink-500" />
                  </div>
                </div>

                <div className="flex flex-col space-y-6">
                  <h3 className="text-lg lg:text-xl font-bold">Live Radar</h3>
                  <SafetyRadar status={safetyReport?.status || SafetyStatus.SAFE} confidence={mlConfidence} />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-3xl p-6 lg:p-8 shadow-sm border border-slate-200 flex flex-col min-h-[400px]">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                      <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
                        <Activity size={20} />
                      </div>
                      <h3 className="text-lg lg:text-xl font-bold">AI Insight</h3>
                    </div>
                    {isAnalyzing && (
                      <div className="flex items-center space-x-2 text-indigo-600 text-xs font-medium animate-pulse">
                        <Activity size={14} />
                        <span>Analyzing...</span>
                      </div>
                    )}
                  </div>

                  {safetyReport ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div>
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">Summary</h4>
                        <p className="text-base lg:text-lg text-slate-700 leading-relaxed font-medium italic">"{safetyReport.summary}"</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-50">
                        <div>
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest flex items-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-2" />
                            Resident Actions
                          </h4>
                          <ul className="space-y-2">
                            {safetyReport.actions_for_user.map((action, i) => (
                              <li key={i} className="flex items-start space-x-2 text-xs lg:text-sm text-slate-600">
                                <span className="mt-1 text-indigo-500">•</span>
                                <span>{action}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest flex items-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 mr-2" />
                            Warden Protocol
                          </h4>
                          <ul className="space-y-2">
                            {safetyReport.actions_for_warden.map((action, i) => (
                              <li key={i} className="flex items-start space-x-2 text-xs lg:text-sm text-slate-600">
                                <span className="mt-1 text-slate-400">•</span>
                                <span>{action}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
                      <Zap size={48} className="mb-4 text-indigo-300" />
                      <p className="text-sm">Initializing Safety Monitoring...</p>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-3xl p-6 lg:p-8 shadow-sm border border-slate-200">
                  <h3 className="text-lg lg:text-xl font-bold mb-6 flex items-center space-x-2 text-slate-800">
                    <History className="text-indigo-500" size={20} />
                    <span>Real-time Trends</span>
                  </h3>
                  <div className="h-[250px] lg:h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history}>
                        <defs>
                          <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorGas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorNoise" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#94a3b8'}} hide={window.innerWidth < 640} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                        <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '12px'}} />
                        <Area type="monotone" dataKey="temp" stroke="#f97316" fillOpacity={1} fill="url(#colorTemp)" strokeWidth={3} />
                        <Area type="monotone" dataKey="gas" stroke="#a855f7" fillOpacity={1} fill="url(#colorGas)" strokeWidth={3} />
                        <Area type="monotone" dataKey="noise" stroke="#ec4899" fillOpacity={1} fill="url(#colorNoise)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center space-x-3">
                    <History className="text-indigo-600" size={24} />
                    <h3 className="text-lg lg:text-xl font-bold">Safety Event History</h3>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={handleExportLogs} 
                      disabled={logs.length === 0}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-30 disabled:cursor-not-allowed flex items-center space-x-1 uppercase tracking-wider bg-white border border-indigo-100 px-3 py-1.5 rounded-lg transition-all"
                    >
                      <Download size={14} />
                      <span>Export CSV</span>
                    </button>
                    <button 
                      onClick={handleClearLogs} 
                      className="text-[10px] font-bold text-slate-400 hover:text-red-500 flex items-center space-x-1 uppercase tracking-wider px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all"
                    >
                      <AlertTriangle size={14} />
                      <span>Clear Data</span>
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-bold uppercase tracking-widest border-b border-slate-100">
                        <th className="px-6 py-4">Timestamp</th>
                        <th className="px-6 py-4">Context State</th>
                        <th className="px-6 py-4">AI Assessment</th>
                        <th className="px-6 py-4 hidden sm:table-cell">Sensor Summary Snapshot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.map((log, i) => (
                        <tr key={i} className="hover:bg-indigo-50/20 transition-colors">
                          <td className="px-6 py-4 text-xs font-medium text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-tight ${
                              log.ml_state === MLState.NORMAL ? 'bg-emerald-100 text-emerald-700' : 
                              log.status === SafetyStatus.DANGER ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                            }`}>{log.ml_state}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-2">
                              <div className={`w-2 h-2 rounded-full ${
                                log.status === SafetyStatus.SAFE ? 'bg-emerald-500' : 
                                log.status === SafetyStatus.WARNING ? 'bg-amber-500' : 'bg-red-500'
                              }`} />
                              <span className={`text-xs font-bold ${
                                log.status === SafetyStatus.SAFE ? 'text-emerald-700' : 
                                log.status === SafetyStatus.WARNING ? 'text-amber-700' : 'text-red-700'
                              }`}>{log.status}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-[10px] font-mono text-slate-400 truncate max-w-xs hidden sm:table-cell">
                            {log.sensor_summary}
                          </td>
                        </tr>
                      ))}
                      {logs.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-16 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center opacity-50">
                              <Activity size={48} className="mb-4 text-slate-200" />
                              <p className="text-sm font-medium tracking-wide">No historical safety events logged.</p>
                              <p className="text-[10px] mt-1">Simulate a scenario to populate this table.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <footer className="pt-8 pb-4 text-center border-t border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  All rights reserved @2025
                </p>
              </footer>
            </>
          ) : (
            <div className="max-w-4xl mx-auto space-y-12 pb-20">
              <section className="space-y-4">
                <div className="bg-indigo-600 w-12 h-12 rounded-xl flex items-center justify-center text-white mb-6 shadow-lg">
                  <Cpu size={24} />
                </div>
                <h2 className="text-3xl lg:text-4xl font-black tracking-tight">How it Works</h2>
                <p className="text-slate-600 text-base lg:text-lg leading-relaxed">
                  SafetyHalo AI is a context-classification system that converts raw sensor streams into human-readable safety assessments. 
                  It differentiates between normal activity (like sleeping or studying) and hazardous situations (like falls or gas leaks) 
                  by observing multi-modal sensor patterns.
                </p>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-200 space-y-4 shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Wind size={20} />
                  </div>
                  <h3 className="text-xl font-bold">IoT Data Fusion</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    Sensors for motion, sound, gas, and temperature feed into an edge gateway. This system reduces 
                    "false positives" by correlating environmental data with movement patterns.
                  </p>
                </div>
                <div className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-200 space-y-4 shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Zap size={20} />
                  </div>
                  <h3 className="text-xl font-bold">Gemini Context Engine</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    We utilize <strong>Gemini 3 Flash</strong> to perform natural language reasoning on processed sensor logs, 
                    allowing the system to provide "Explainable Safety" instead of just binary alarms.
                  </p>
                </div>
              </div>

              <section className="space-y-6">
                <h3 className="text-2xl font-black">Safety Status Glossary</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
                  <div className="p-6 bg-white border border-slate-100 rounded-3xl space-y-3 shadow-sm hover:shadow-md transition-shadow">
                    <ShieldCheck className="text-emerald-500" size={32} />
                    <h4 className="font-bold text-emerald-700">SAFE</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">Everything is normal. Sensors indicate standard occupancy patterns without environmental anomalies.</p>
                  </div>
                  <div className="p-6 bg-white border border-slate-100 rounded-3xl space-y-3 shadow-sm hover:shadow-md transition-shadow">
                    <ShieldAlert className="text-amber-500" size={32} />
                    <h4 className="font-bold text-amber-700">WARNING</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">Unexpected patterns detected. This could be a student being unusually still or a slight temp rise. Needs check-in.</p>
                  </div>
                  <div className="p-6 bg-white border border-slate-100 rounded-3xl space-y-3 shadow-sm hover:shadow-md transition-shadow">
                    <ShieldX className="text-red-500" size={32} />
                    <h4 className="font-bold text-red-700">DANGER</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">Critical incident in progress. High confidence of gas leak, fire, or physical fall. Emergency contacts notified.</p>
                  </div>
                </div>
              </section>

              <div className="bg-slate-900 rounded-3xl p-8 lg:p-12 text-white flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="relative z-10 space-y-2 text-center md:text-left">
                  <h3 className="text-2xl font-bold">Developer Resources</h3>
                  <p className="text-slate-400 text-sm">Access the full API schema and implementation guide.</p>
                </div>
                <a 
                  href="https://ai.google.dev/gemini-api/docs" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="relative z-10 bg-white text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center space-x-2 hover:bg-slate-200 transition-all shadow-xl active:scale-95"
                >
                  <span>API Documentation</span>
                  <ExternalLink size={18} />
                </a>
              </div>

              <footer className="pt-8 pb-4 text-center">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  All rights reserved @2025
                </p>
              </footer>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
