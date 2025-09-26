import React from 'react';
import './DarkModeToggle.css';

const DarkModeToggle = ({ isDarkMode, toggleDarkMode }) => {
    return (
        <div className="dark-mode-toggle">
            <label className="switch">
                <input type="checkbox" checked={isDarkMode} onChange={toggleDarkMode} />
                <span className="slider round"></span>
            </label>
            <span className="toggle-label">Dark Mode</span>
        </div>
    );
};

export default DarkModeToggle;
