import React from 'react';
import { SafetyStatus } from '../types.ts';
import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';

interface SafetyRadarProps {
  status: SafetyStatus;
  confidence: number;
}

const SafetyRadar: React.FC<SafetyRadarProps> = ({ status, confidence }) => {
  const getColors = () => {
    switch (status) {
      case SafetyStatus.DANGER:
        return { 
          bg: 'bg-rose-500', 
          text: 'text-rose-500', 
          icon: <ShieldX size={48} />, 
          label: 'CRITICAL THREAT',
          ring: 'ring-rose-500/20'
        };
      case SafetyStatus.WARNING:
        return { 
          bg: 'bg-amber-500', 
          text: 'text-amber-500', 
          icon: <ShieldAlert size={48} />, 
          label: 'ANOMALY DETECTED',
          ring: 'ring-amber-500/20'
        };
      default:
        return { 
          bg: 'bg-emerald-500', 
          text: 'text-emerald-500', 
          icon: <ShieldCheck size={48} />, 
          label: 'NOMINAL STATUS',
          ring: 'ring-emerald-500/20'
        };
    }
  };

  const colors = getColors();

  return (
    <div className="glass rounded-[3rem] p-10 flex flex-col items-center justify-center relative overflow-hidden group shadow-2xl">
      <div className={`absolute top-0 left-0 w-full h-1.5 ${colors.bg} opacity-50`} />
      
      <div className={`p-8 rounded-full ${colors.bg} bg-opacity-10 mb-6 relative ring-8 ${colors.ring} transition-all duration-500 group-hover:scale-105`}>
        <div className={colors.text}>
          {colors.icon}
        </div>
      </div>
      
      <h2 className={`text-2xl font-black tracking-tighter ${colors.text} mb-1 uppercase`}>
        {colors.label}
      </h2>
      <div className="flex items-center space-x-2 text-slate-500 text-[10px] font-black uppercase tracking-widest">
        <span>Model Assurance</span>
        <span className="text-white">{(confidence * 100).toFixed(0)}%</span>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-2 w-full max-w-[180px]">
        <div className={`h-1.5 rounded-full ${status === SafetyStatus.SAFE ? 'bg-emerald-500' : 'bg-white/5'}`} />
        <div className={`h-1.5 rounded-full ${status === SafetyStatus.WARNING ? 'bg-amber-500' : 'bg-white/5'}`} />
        <div className={`h-1.5 rounded-full ${status === SafetyStatus.DANGER ? 'bg-rose-500' : 'bg-white/5'}`} />
      </div>
    </div>
  );
};

export default SafetyRadar;