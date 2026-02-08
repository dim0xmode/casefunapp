import React from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search',
  className = '',
}) => {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={[
        'w-full md:w-[320px] px-3 py-2 rounded-lg bg-black/40 border border-white/[0.08] focus:outline-none focus:border-web3-accent/50 text-sm',
        className,
      ].join(' ')}
    />
  );
};
