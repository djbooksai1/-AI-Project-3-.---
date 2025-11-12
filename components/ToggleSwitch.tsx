import React from 'react';

interface ToggleSwitchProps {
    isOn: boolean;
    handleToggle: () => void;
    id: string; // Add id for accessibility
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ isOn, handleToggle, id }) => {
    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={isOn}
            onClick={handleToggle}
            className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:ring-offset-surface ${
                isOn ? 'bg-accent' : 'bg-primary'
            }`}
        >
            <span
                className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${
                    isOn ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
        </button>
    );
};