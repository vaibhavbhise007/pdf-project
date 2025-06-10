import React from 'react';
import '../styles/StatusBar.css';

const StatusBar = ({ message }) => {
  if (!message) return null;
  
  return (
    <div className="status-bar">
      <span className="status-message">{message}</span>
    </div>
  );
};

export default StatusBar;