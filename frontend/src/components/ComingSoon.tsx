import React from 'react';

export const ComingSoon: React.FC = () => {
  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="text-center space-y-4">
        <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-web3-accent to-web3-purple">
          Coming Soon
        </h2>
        <p className="text-gray-400 text-xl">This feature is under development</p>
      </div>
    </div>
  );
};
