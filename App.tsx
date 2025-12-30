
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Activity, Thermometer, Wind, Volume2, Info, Zap, LayoutDashboard, 
  ShieldCheck, ShieldAlert, ShieldX, Lock, ArrowRight, LogOut, 
  BrainCircuit, Microchip, Eye, EyeOff, KeyRound, Server, AlertCircle,
  Target
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';

import { 
  SafetyStatus, MLState, SensorData, RoomContext, GeminiSafetyReport, LogEntry
} from './types.ts';
import { analyzeSafetyContext } from './services/geminiService.ts';
import SensorMetric from './components/SensorMetric.tsx';
import SafetyRadar from './components/SafetyRadar.tsx';

const INITIAL_SENSORS: SensorData = {
  motion_events_last_15min: 12,
  avg_temperature_c: 22.8,
  avg_humidity: 48,
  gas_level: 0.08,
  smoke_level: 0.02,
  noise_level: 0.15,
  door_open: false
};

const SCENARIOS = {
  NORMAL: {
    ml_state: MLState.NORMAL,
    sensors: { ...INITIAL_SENSORS },
    notes: "Baseline resident activity."
  },
  FALL_INCIDENT: {
    ml_state: MLState.FALL_LIKELY,
    sensors: { ...INITIAL_SENSORS, motion_events_last_15min: 145, noise_level: 0.88 },
    notes: "Sharp acoustic peak followed by sustained immobility."
  },
  GAS_DETECTED: {
    ml_state: MLState.GAS_SMOKE_ALERT,
    sensors: { ...INITIAL_SENSORS, gas_level: 0.92, smoke_level: 0.15 },
    notes: "Concentrated gas reading detected in kitchenette."
  },
  THERMAL_ALERT: {
    ml_state: MLState.OVERHEAT_RISK,
    sensors: { ...INITIAL_SENSORS, avg_temperature_c: 48.5, smoke_level: 0.4 },
    notes: "Rapid localized temperature delta identified."
  },
  NIGHT_INACTIVE: {
    ml_state: MLState.NO_MOVEMENT,
    sensors: { ...INITIAL_SENSORS, motion_events_last_15min: 0 },
    notes: "Zero activity detected during expected active hours."
  },
  DISTURBANCE: {
    ml_state: MLState.LOUD_NOISE,
    sensors: { ...INITIAL_SENSORS, noise_level: 0.98 },
    notes: "Unusual high-frequency noise detected."
  }
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'info'>('dashboard');
  
  const [sensors, setSensors] = useState<SensorData>(INITIAL_SENSORS);
  const [mlState, setMlState] = useState<MLState>(MLState.NORMAL);
  const [mlConfidence, setMlConfidence] = useState(0.99);
  const [safetyReport, setSafetyReport] = useState<GeminiSafetyReport | null>(null);
  const [showRawContext, setShowRawContext] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1234') {
      setIsAuthenticated(true);
      setLoginError(false);
    } else {
      setLoginError(true);
      setPin('');
    }
  };

  const playAlertSound = useCallback((status: SafetyStatus) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const playBeep = (freq: number, duration: number, startTime: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
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
      for (let i = 0; i < 4; i++) playBeep(900, 0.15, now + (i * 0.2));
    } else if (status === SafetyStatus.WARNING) {
      playBeep(440, 0.5, now);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setHistory(prev => {
        const newData = [...prev, {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          temp: sensors.avg_temperature_c + (Math.random() - 0.5),
          gas: sensors.gas_level * 100 + (Math.random() * 5),
          noise: sensors.noise_level * 100 + (Math.random() * 10)
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
      if (report.status !== SafetyStatus.SAFE) {
        playAlertSound(report.status);
      }
      setLogs(prev => [
        {
          timestamp: new Date().toLocaleTimeString(),
          status: report.status,
          ml_state: currentContext.ml_state,
          sensor_summary: `T:${currentContext.sensors.avg_temperature_c.toFixed(1)} G:${(currentContext.sensors.gas_level*100).toFixed(0)}`
        },
        ...prev
      ].slice(0, 10));
    } catch (err) {
      console.error("AI Node Failure:", err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [playAlertSound]);

  const triggerScenario = (key: keyof typeof SCENARIOS) => {
    const s = SCENARIOS[key];
    const conf = 0.85 + Math.random() * 0.14;
    setSensors(s.sensors);
    setMlState(s.ml_state);
    setMlConfidence(conf);
    
    const context: RoomContext = {
      room_id: "WEST_WING_B4",
      time: new Date().toISOString(),
      ml_state: s.ml_state,
      ml_confidence: conf,
      sensors: s.sensors,
      expected_occupancy: "occupied",
      notes: s.notes
    };
    runAnalysis(context);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full glass rounded-[3rem] p-12 text-center shadow-2xl relative">
          <div className="bg-indigo-600 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-indigo-500/30">
            <ShieldCheck className="text-white" size={48} />
          </div>
          <h1 className="text-4xl font-black mb-2 text-white">SafetyHalo</h1>
          <p className="text-slate-400 mb-10">AI Contextual Guardian for Hostels</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
              <input 
                type="password"
                placeholder="System PIN (1234)"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className={`w-full bg-white/5 border ${loginError ? 'border-rose-500' : 'border-white/10'} rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all`}
                autoFocus
              />
            </div>
            {loginError && <p className="text-rose-500 text-xs font-bold animate-pulse">Incorrect Access Code</p>}
            <button 
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-5 rounded-2xl shadow-lg transition-all transform active:scale-[0.98] flex items-center justify-center space-x-3"
            >
              <span>Initialize Node</span>
              <ArrowRight size={20} />
            </button>
          </form>
          <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-center space-x-6 text-slate-500">
             <div className="flex flex-col items-center"><Server size={18} /><span className="text-[10px] uppercase font-bold mt-1">Edge</span></div>
             <div className="flex flex-col items-center"><BrainCircuit size={18} /><span className="text-[10px] uppercase font-bold mt-1">AIoT</span></div>
             <div className="flex flex-col items-center"><Microchip size={18} /><span className="text-[10px] uppercase font-bold mt-1">ML</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="lg:w-72 glass border-r-0 lg:border-r border-white/10 lg:h-screen sticky top-0 z-40 p-8 flex flex-col">
        <div className="flex items-center space-x-4 mb-12">
          <div className="bg-indigo-600 p-2 rounded-xl text-white">
            <Activity size={24} />
          </div>
          <h1 className="text-2xl font-black text-white">Halo AI</h1>
        </div>

        <nav className="flex-1 space-y-3">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center space-x-3 p-4 rounded-2xl font-bold transition-all ${
              activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <LayoutDashboard size={20} />
            <span>Monitor Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('info')}
            className={`w-full flex items-center space-x-3 p-4 rounded-2xl font-bold transition-all ${
              activeTab === 'info' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            <Info size={20} />
            <span>System Logic</span>
          </button>
        </nav>

        <button 
          onClick={() => setIsAuthenticated(false)}
          className="mt-auto flex items-center justify-center space-x-2 p-4 text-slate-500 hover:text-rose-500 transition-all text-xs font-black uppercase tracking-widest"
        >
          <LogOut size={16} />
          <span>Shutdown Node</span>
        </button>
      </aside>

      {/* Content */}
      <main className="flex-1 p-8 lg:p-12 overflow-y-auto">
        {activeTab === 'dashboard' ? (
          <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-slate-500 text-sm font-bold uppercase tracking-[0.2em] mb-1">Active Monitoring • Cluster 04</h2>
                <div className="flex items-center space-x-3">
                   <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
                   <h3 className="text-3xl font-black text-white">Room West-B4</h3>
                </div>
              </div>
              <div className="flex items-center bg-white/5 p-2 rounded-2xl border border-white/5">
                {Object.keys(SCENARIOS).map((key) => (
                  <button 
                    key={key}
                    onClick={() => triggerScenario(key as keyof typeof SCENARIOS)}
                    className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                  >
                    {key.split('_')[0]}
                  </button>
                ))}
              </div>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              <div className="xl:col-span-2 space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SensorMetric label="Motion" value={sensors.motion_events_last_15min} unit="ev" icon={<Activity />} color="bg-indigo-500" />
                  <SensorMetric label="Temp" value={sensors.avg_temperature_c.toFixed(1)} unit="°C" icon={<Thermometer />} color="bg-orange-500" />
                  <SensorMetric label="Gas" value={(sensors.gas_level * 100).toFixed(0)} unit="%" icon={<Wind />} color="bg-cyan-500" />
                  <SensorMetric label="Noise" value={(sensors.noise_level * 100).toFixed(0)} unit="dB" icon={<Volume2 />} color="bg-rose-500" />
                </div>

                <div className="glass rounded-[2.5rem] p-8 min-h-[380px] flex flex-col">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center space-x-4">
                      <div className="bg-indigo-500/20 p-3 rounded-2xl text-indigo-400">
                        <BrainCircuit size={28} />
                      </div>
                      <h4 className="text-xl font-black text-white">AI Reasoning Explanation</h4>
                    </div>
                    <button 
                      onClick={() => setShowRawContext(!showRawContext)}
                      className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 hover:text-indigo-300 flex items-center space-x-2"
                    >
                      {showRawContext ? <EyeOff size={14} /> : <Eye size={14} />}
                      <span>{showRawContext ? 'Hide Context' : 'View Context'}</span>
                    </button>
                  </div>

                  {isAnalyzing ? (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                      <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest animate-pulse">Gemini analyzing context...</p>
                    </div>
                  ) : safetyReport ? (
                    <div className="flex-1 space-y-8 animate-in fade-in zoom-in-95 duration-500">
                      {showRawContext ? (
                        <div className="bg-black/40 p-6 rounded-3xl border border-white/5 font-mono text-[10px] text-indigo-300 overflow-x-auto">
                          <pre>{JSON.stringify({ sensors, mlState, mlConfidence }, null, 2)}</pre>
                        </div>
                      ) : (
                        <>
                          <p className="text-2xl font-semibold leading-relaxed text-slate-200">
                            <span className="text-indigo-500 font-black">AI ASSESSMENT:</span> "{safetyReport.summary}"
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                              <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Resident Directives</h5>
                              <ul className="space-y-3">
                                {safetyReport.actions_for_user.map((a, i) => (
                                  <li key={i} className="flex items-start space-x-3 text-sm text-slate-300">
                                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                    <span>{a}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                              <h5 className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-4">Warden Directives</h5>
                              <ul className="space-y-3">
                                {safetyReport.actions_for_warden.map((a, i) => (
                                  <li key={i} className="flex items-start space-x-3 text-sm text-slate-300">
                                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
                                    <span>{a}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-600 italic">
                      Initialize a scenario to begin AI context evaluation.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-8">
                <SafetyRadar status={safetyReport?.status || SafetyStatus.SAFE} confidence={mlConfidence} />
                
                <div className="glass rounded-[2.5rem] p-8">
                  <h4 className="text-sm font-bold text-white mb-6">Real-time Telemetry</h4>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history}>
                        <defs>
                          <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                        <XAxis dataKey="time" hide />
                        <YAxis hide />
                        <Tooltip contentStyle={{background: '#0f172a', border: '1px solid #334155', borderRadius: '12px'}} />
                        <Area type="monotone" dataKey="temp" stroke="#6366f1" fillOpacity={1} fill="url(#colorTemp)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass rounded-[2.5rem] p-8">
                  <h4 className="text-sm font-bold text-white mb-4">Event Ledger</h4>
                  <div className="space-y-4 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                    {logs.map((log, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500 font-mono">{log.timestamp}</span>
                        <span className="text-slate-200 font-bold uppercase tracking-wider">{log.ml_state}</span>
                        <span className={`px-2 py-0.5 rounded-full font-black ${
                          log.status === SafetyStatus.SAFE ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                        }`}>{log.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section className="space-y-6">
              <h2 className="text-5xl font-black text-white tracking-tighter">AI Explanation System</h2>
              <p className="text-xl text-slate-400 leading-relaxed">
                SafetyHalo is designed to bridge the gap between raw sensors and human understanding. Instead of just triggering a buzzer, it explains *why* the buzzer is sounding.
              </p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="glass p-8 rounded-[2.5rem] border-indigo-500/20">
                <div className="bg-indigo-600/20 w-12 h-12 rounded-2xl flex items-center justify-center text-indigo-400 mb-6">
                   <Target size={24} />
                </div>
                <h4 className="text-xl font-bold text-white mb-4">Phase 1: Local ML Fusion</h4>
                <p className="text-slate-400 text-sm leading-relaxed">
                  On the device (Edge), we monitor acoustic signatures and environmental trends. A localized model identifies patterns like "Suspected Fall" or "Gas Anomaly" with low latency.
                </p>
              </div>

              <div className="glass p-8 rounded-[2.5rem] border-rose-500/20">
                <div className="bg-rose-600/20 w-12 h-12 rounded-2xl flex items-center justify-center text-rose-400 mb-6">
                   <AlertCircle size={24} />
                </div>
                <h4 className="text-xl font-bold text-white mb-4">Phase 2: Gemini Reasoning</h4>
                <p className="text-slate-400 text-sm leading-relaxed">
                  When a safety threshold is crossed, Gemini is invoked. It looks at the *entire room context* (Time of day, humidity delta, historical occupancy) to determine if the threat is legitimate or a false positive.
                </p>
              </div>
            </div>

            <section className="glass p-10 rounded-[3rem]">
              <h3 className="text-2xl font-black text-white mb-8 flex items-center space-x-4">
                <Server className="text-indigo-400" />
                <span>Architecture Breakdown</span>
              </h3>
              <div className="space-y-10">
                <div className="relative pl-10 border-l-2 border-indigo-500/30 py-2">
                  <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-indigo-500" />
                  <h5 className="font-bold text-white mb-2 uppercase tracking-widest text-xs">Sensors & Telemetry</h5>
                  <p className="text-sm text-slate-400 italic">DHT22 (Temp), MQ2 (Gas), HC-SR04 (Motion), Microphone (Acoustic).</p>
                </div>
                <div className="relative pl-10 border-l-2 border-indigo-500/30 py-2">
                  <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-indigo-500" />
                  <h5 className="font-bold text-white mb-2 uppercase tracking-widest text-xs">Edge Logic (The Gate)</h5>
                  <p className="text-sm text-slate-400 italic">Data is filtered. If "Confidence > 80%", context payload is generated.</p>
                </div>
                <div className="relative pl-10 border-l-2 border-emerald-500/30 py-2">
                  <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-emerald-500 animate-pulse" />
                  <h5 className="font-bold text-emerald-400 mb-2 uppercase tracking-widest text-xs">AI Context Awareness</h5>
                  <p className="text-sm text-slate-400 italic">Gemini 3 Flash decodes JSON context into human language directives.</p>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
