import React from 'react';
import { AlertTriangle, Info, Clock, Download } from 'lucide-react';

const AlertsPanel = ({ alerts, selectedService }) => {
  const formatTimestamp = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getAlertIcon = (type, severity) => {
    if (type === 'snapshot') {
      return <Download className="w-4 h-4" />;
    }
    
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-4 h-4" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getAlertClass = (severity) => {
    switch (severity) {
      case 'critical':
        return 'alert-critical';
      case 'warning':
        return 'alert-warning';
      default:
        return 'alert-info';
    }
  };

  if (alerts.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Alerts</h2>
        </div>
        <div className="empty-state">
          <div className="empty-state-title">No Alerts</div>
          <div className="empty-state-description">
            {selectedService 
              ? `No alerts for ${selectedService}` 
              : 'Memory leak alerts will appear here'}
          </div>
        </div>
      </div>
    );
  }

  return (
          <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            Alerts {selectedService ? `- ${selectedService}` : ''} ({alerts.length})
          </h2>
        </div>
      
      <div style={{ 
        maxHeight: '400px', 
        overflowY: 'auto',
        paddingRight: '0.5rem'
      }}>
        {alerts.map((alert) => (
          <div key={alert.id} className={`alert ${getAlertClass(alert.severity)}`}>
            <div className="alert-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {getAlertIcon(alert.type, alert.severity)}
                <span>{alert.service}</span>
              </div>
              <div className="alert-time" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Clock className="w-3 h-3" />
                {formatTimestamp(alert.timestamp)}
              </div>
            </div>
            
            <div style={{ fontSize: '0.875rem', lineHeight: '1.4' }}>
              {alert.message}
            </div>
            
            {/* Additional details for different alert types */}
            {alert.type === 'leak' && (
              <div style={{ 
                marginTop: '0.5rem',
                fontSize: '0.75rem',
                display: 'flex',
                gap: '1rem',
                opacity: 0.8
              }}>
                <span>Current: {alert.heapUsedMB}MB</span>
                <span>Growth: +{alert.memoryGrowthMB}MB</span>
              </div>
            )}
            
            {alert.type === 'snapshot' && (
              <div style={{ 
                marginTop: '0.5rem',
                fontSize: '0.75rem',
                opacity: 0.8
              }}>
                File: {alert.filename}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {alerts.length > 0 && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          backgroundColor: '#f9fafb',
          borderRadius: '6px',
          fontSize: '0.875rem',
          textAlign: 'center',
          color: '#6b7280'
        }}>
          Showing latest {Math.min(alerts.length, 50)} alerts
        </div>
      )}
    </div>
  );
};

export default AlertsPanel;
