import React, { useState, useEffect } from 'react';

const CooldownTimer = ({ initialTime }) => {
    const [timeLeft, setTimeLeft] = useState(initialTime);

    useEffect(() => {
        if (timeLeft <= 0) return;

        const intervalId = setInterval(() => {
            setTimeLeft(prevTime => prevTime - 1000);
        }, 1000);

        return () => clearInterval(intervalId);
    }, [timeLeft]);

    const formatTime = (ms) => {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    if (timeLeft <= 0) {
        return null;
    }

    return (
        <div className="cooldown-timer-content">
            <h2>You have shared a feeling recently.</h2>
            <p>You can share another in:</p>
            <div className="cooldown-timer-display">{formatTime(timeLeft)}</div>
        </div>
    );
};

export default CooldownTimer;