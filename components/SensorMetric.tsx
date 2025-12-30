import React from 'react';

interface SensorMetricProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ReactElement;
  color: string;
}

const SensorMetric: React.FC<SensorMetricProps> = ({ label, value, unit, icon, color }) => {
  return (
    <div className="glass p-6 rounded-[2rem] flex flex-col justify-between group hover:border-indigo-500/30 transition-all duration-500">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-4 ${color} bg-opacity-10 text-white transition-transform group-hover:scale-110`}>
        {React.cloneElement(icon, { size: 20 })}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{label}</p>
        <p className="text-3xl font-black text-white">
          {value}
          <span className="text-sm font-medium text-slate-500 ml-1">{unit}</span>
        </p>
      </div>
    </div>
  );
};

export default SensorMetric;