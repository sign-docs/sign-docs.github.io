
import React from 'react';

interface SpinnerProps {
    message?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 bg-gray-800/50 rounded-lg">
      <div className="w-12 h-12 border-4 border-t-cyan-400 border-r-cyan-400 border-b-gray-600 border-l-gray-600 rounded-full animate-spin"></div>
      {message && <p className="text-lg font-semibold text-gray-200">{message}</p>}
    </div>
  );
};
