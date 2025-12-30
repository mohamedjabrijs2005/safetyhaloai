
import React from 'react';

interface SensorMetricProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  color: string;
}

const SensorMetric: React.FC<SensorMetricProps> = ({ label, value, unit, icon, color }) => {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4">
      <div className={`p-3 rounded-xl ${color} bg-opacity-10 text-${color.split('-')[1]}-600`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-slate-800">
          {value}
          <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>
        </p>
      </div>
    </div>
  );
};

export default SensorMetric;
