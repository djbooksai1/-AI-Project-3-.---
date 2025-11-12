import React from 'react';

type AlertType = 'danger' | 'success' | 'info';

interface AlertProps {
    type: AlertType;
    message: string;
    onClose?: () => void;
}

const alertStyles: Record<AlertType, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
    danger: {
        bg: 'bg-danger/20',
        border: 'border-danger',
        text: 'text-danger',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
    success: {
        bg: 'bg-success/20',
        border: 'border-success',
        text: 'text-success',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
    info: {
        bg: 'bg-accent/20',
        border: 'border-accent',
        text: 'text-accent',
        icon: (
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
};

export const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => {
    const styles = alertStyles[type];

    return (
        <div className={`${styles.bg} ${styles.border} ${styles.text} p-4 rounded-md mb-6 flex items-start gap-3`}>
            <div className="flex-shrink-0">{styles.icon}</div>
            <div className="flex-grow">
                <strong>{type === 'danger' ? '오류' : type === 'success' ? '성공' : '정보'}:</strong> {message}
            </div>
            {onClose && (
                <button onClick={onClose} className={`ml-4 p-1 rounded-full hover:bg-black/20`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}
        </div>
    );
};