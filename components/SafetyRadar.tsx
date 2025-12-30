
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
        return { bg: 'bg-red-500', text: 'text-red-500', icon: <ShieldX size={48} />, label: 'DANGER' };
      case SafetyStatus.WARNING:
        return { bg: 'bg-amber-500', text: 'text-amber-500', icon: <ShieldAlert size={48} />, label: 'WARNING' };
      default:
        return { bg: 'bg-emerald-500', text: 'text-emerald-500', icon: <ShieldCheck size={48} />, label: 'SAFE' };
    }
  };

  const colors = getColors();

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white rounded-3xl shadow-lg border border-slate-100 relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-full h-1 ${colors.bg}`} />
      
      <div className={`p-6 rounded-full ${colors.bg} bg-opacity-10 mb-4 animate-pulse`}>
        <div className={colors.text}>
          {colors.icon}
        </div>
      </div>
      
      <h2 className={`text-4xl font-black tracking-tighter ${colors.text} mb-1`}>
        {colors.label}
      </h2>
      <p className="text-slate-400 text-sm font-medium">
        Confidence: {(confidence * 100).toFixed(0)}%
      </p>

      <div className="mt-6 flex space-x-2">
        <div className={`h-2 w-12 rounded-full ${status === SafetyStatus.SAFE ? 'bg-emerald-500' : 'bg-slate-100'}`} />
        <div className={`h-2 w-12 rounded-full ${status === SafetyStatus.WARNING ? 'bg-amber-500' : 'bg-slate-100'}`} />
        <div className={`h-2 w-12 rounded-full ${status === SafetyStatus.DANGER ? 'bg-red-500' : 'bg-slate-100'}`} />
      </div>
    </div>
  );
};

export default SafetyRadar;
