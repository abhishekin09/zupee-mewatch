import React from 'react';
import { Activity, Wifi, WifiOff, AlertTriangle } from 'lucide-react';

const Header = ({ connectionStatus }) => {
  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi className="w-5 h-5" />;
      case 'disconnected':
        return <WifiOff className="w-5 h-5" />;
      case 'error':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <WifiOff className="w-5 h-5" />;
    }
  };

  const getStatusClass = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'status-connected';
      case 'disconnected':
        return 'status-disconnected';
      case 'error':
        return 'status-error';
      default:
        return 'status-disconnected';
    }
  };

  return (
    <header style={{
      background: 'white',
      borderBottom: '1px solid #e5e7eb',
      padding: '1rem 2rem',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Activity className="w-8 h-8 text-blue-600" />
          <div>
            <h1 style={{ 
              margin: 0, 
              fontSize: '1.5rem', 
              fontWeight: '700',
              color: '#1f2937'
            }}>
              Zupee MemWatch
            </h1>
            <p style={{ 
              margin: 0, 
              fontSize: '0.875rem', 
              color: '#6b7280' 
            }}>
              Real-time Memory Leak Detection
            </p>
          </div>
        </div>

        <div className={`status-indicator ${getStatusClass()}`}>
          {getStatusIcon()}
          <span style={{ textTransform: 'capitalize' }}>
            {connectionStatus}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
