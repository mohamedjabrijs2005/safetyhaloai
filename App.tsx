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
} from './types.ts';
import { analyzeSafetyContext } from './services/geminiService.ts';
import SensorMetric from './components/SensorMetric.tsx';
import SafetyRadar from './components/SafetyRadar.tsx';

const LOCAL_STORAGE_KEY = 'safety_halo_logs';
const SETTINGS_KEY = 'safety_halo_settings';

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
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? JSON.parse(saved).alertsEnabled : true;
    } catch { return true; }
  });

  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? JSON.parse(saved).confidenceThreshold : 0.75;
    } catch { return 0.75; }
  });
  
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const savedLogs = localStorage.getItem(LOCAL_STORAGE_KEY);
      return savedLogs ? JSON.parse(savedLogs) : [];
    } catch { return []; }
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
      gain.gain.setValueAtTime(0.05, startTime);
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
    try {
      const report = await analyzeSafetyContext(currentContext);
      setSafetyReport(report);
      if (report.status === SafetyStatus.WARNING || report.status === SafetyStatus.DANGER) {
        playAlertSound(report.status);
      }
      setLogs(prev => {
        const newLog: LogEntry = {
          timestamp: new Date().toLocaleString(),
          status: report.status,
          ml_state: currentContext.ml_state,
          sensor_summary: `T: ${currentContext.sensors.avg_temperature_c.toFixed(1)}°C | G: ${(currentContext.sensors.gas_level * 100).toFixed(0)}% | N: ${(currentContext.sensors.noise_level * 100).toFixed(0)}%`
        };
        return [newLog, ...prev].slice(0, 50);
      });
    } catch (err) {
      console.error("Analysis failed", err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [playAlertSound]);

  const triggerScenario = (key: keyof typeof SCENARIOS) => {
    const scenario = SCENARIOS[key];
    const generatedConfidence = 0.65 + Math.random() * 0.35;
    
    setSensors(scenario.sensors);
    setMlState(scenario.ml_state);
    setMlConfidence(generatedConfidence);
    
    const context: RoomContext = {
      room_id: "HOSTEL_A_204",
      time: new Date().toISOString(),
      ml_state: scenario.ml_state,
      ml_confidence: generatedConfidence,
      sensors: scenario.sensors,
      expected_occupancy: "occupied_at_night",
      notes: scenario.notes
    };
    
    if (generatedConfidence >= confidenceThreshold) {
      runAnalysis(context);
    } else {
      setSafetyReport({
        status: SafetyStatus.SAFE,
        summary: `ML Confidence (${(generatedConfidence * 100).toFixed(0)}%) below gate threshold. AI check skipped.`,
        actions_for_user: ["Manual sensor check recommended."],
        actions_for_warden: ["Monitor logs."]
      });
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      triggerScenario('NORMAL');
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-900 to-slate-900">
        <div className="max-w-md w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl"></div>
          <div className="relative z-10 text-center">
            <div className="bg-indigo-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-indigo-500/40">
              <ShieldCheck className="text-white" size={40} />
            </div>
            <h1 className="text-4xl font-black text-white tracking-tight mb-4 leading-tight">SafetyHalo AI</h1>
            <p className="text-slate-400 mb-10 text-lg">Context-Aware Security for PGs & Hostels.</p>
            <button 
              onClick={() => setIsAuthenticated(true)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-5 rounded-2xl shadow-xl shadow-indigo-500/30 flex items-center justify-center space-x-3 transition-all transform active:scale-[0.98]"
            >
              <span>Access Hub</span>
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 text-slate-900">
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
        </nav>

        <div className="p-4 mt-auto">
          <button 
            onClick={() => setIsAuthenticated(false)}
            className="w-full mb-4 flex items-center justify-center space-x-2 py-3 border border-slate-200 rounded-xl text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 font-bold uppercase transition-all"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-widest">Hostel A • Room 204</h2>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-lg font-bold">Smart Monitor</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
             <div className="bg-slate-100 rounded-full px-4 py-1.5 flex items-center space-x-2 text-sm font-bold">
                <span className="text-slate-500">Gate:</span>
                <span className="text-indigo-600">{(confidenceThreshold * 100).toFixed(0)}%</span>
             </div>
          </div>
        </header>

        <div className="p-8 space-y-8 max-w-7xl mx-auto">
          {activeTab === 'dashboard' ? (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2 space-y-6">
                  <h3 className="text-lg font-bold flex items-center space-x-2">
                    <Zap className="text-amber-500" size={20} />
                    <span>Scenarios</span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    {Object.keys(SCENARIOS).map((key) => (
                      <button 
                        key={key}
                        onClick={() => triggerScenario(key as keyof typeof SCENARIOS)}
                        className="bg-white p-3 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all text-center group"
                      >
                        <span className="text-[10px] font-bold block capitalize leading-tight text-slate-500 group-hover:text-indigo-600">
                          {key.toLowerCase().replace('_', ' ')}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SensorMetric label="Motion" value={sensors.motion_events_last_15min} unit="evt" icon={<Activity size={20} />} color="bg-blue-500" />
                    <SensorMetric label="Temp" value={sensors.avg_temperature_c.toFixed(1)} unit="°C" icon={<Thermometer size={20} />} color="bg-orange-500" />
                    <SensorMetric label="Gas" value={(sensors.gas_level * 100).toFixed(0)} unit="%" icon={<Wind size={20} />} color="bg-purple-500" />
                    <SensorMetric label="Noise" value={(sensors.noise_level * 100).toFixed(0)} unit="dB" icon={<Volume2 size={20} />} color="bg-pink-500" />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold mb-6">Live Status</h3>
                  <SafetyRadar status={safetyReport?.status || SafetyStatus.SAFE} confidence={mlConfidence} />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 min-h-[300px] flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold flex items-center space-x-3">
                      <BrainCircuit size={24} className="text-indigo-600" />
                      <span>AI Reasoning</span>
                    </h3>
                    {isAnalyzing && <div className="text-indigo-600 text-xs font-bold animate-pulse">ANALYZING...</div>}
                  </div>
                  {safetyReport ? (
                    <div className="space-y-6 animate-in fade-in duration-500">
                      <p className="text-lg text-slate-700 font-medium italic">"{safetyReport.summary}"</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-4 rounded-2xl">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">User</h4>
                          <ul className="text-xs space-y-1">
                            {safetyReport.actions_for_user.map((a, i) => <li key={i}>• {a}</li>)}
                          </ul>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Warden</h4>
                          <ul className="text-xs space-y-1">
                            {safetyReport.actions_for_warden.map((a, i) => <li key={i}>• {a}</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-300 italic">Select a scenario to start analysis.</div>
                  )}
                </div>

                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold mb-6">Trend Chart</h3>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="time" hide />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                        <Tooltip />
                        <Area type="monotone" dataKey="temp" stroke="#f97316" fill="#f97316" fillOpacity={0.1} />
                        <Area type="monotone" dataKey="gas" stroke="#a855f7" fill="#a855f7" fillOpacity={0.1} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4">Time</th>
                      <th className="px-6 py-4">State</th>
                      <th className="px-6 py-4">AI Rating</th>
                      <th className="px-6 py-4">Sensors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map((log, i) => (
                      <tr key={i} className="text-xs hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-slate-500">{log.timestamp}</td>
                        <td className="px-6 py-4 font-bold">{log.ml_state}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full ${
                            log.status === SafetyStatus.SAFE ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-400">{log.sensor_summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="max-w-3xl space-y-8">
              <h2 className="text-3xl font-black">About SafetyHalo</h2>
              <p className="text-slate-600 leading-relaxed">
                SafetyHalo is a reference architecture for smart hostels. It combines edge-based ML state classification with high-level Gemini reasoning to ensure resident safety without intrusive camera surveillance.
              </p>
              <div className="grid grid-cols-2 gap-6">
                <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                  <Cpu className="text-indigo-600 mb-4" />
                  <h4 className="font-bold mb-2">Edge Fusion</h4>
                  <p className="text-sm text-slate-500">Real-time processing of gas, noise, and motion data.</p>
                </div>
                <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                  <BrainCircuit className="text-indigo-600 mb-4" />
                  <h4 className="font-bold mb-2">AI Reasoning</h4>
                  <p className="text-sm text-slate-500">Gemini translates complex sensor logs into clear safety reports.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;