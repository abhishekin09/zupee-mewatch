import React from 'react';
import { Circle, AlertTriangle, TrendingUp } from 'lucide-react';

const ServiceTable = ({ services, selectedService, onServiceSelect }) => {
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const formatMemory = (mb) => {
    if (typeof mb !== 'number') return '0 MB';
    return `${mb.toFixed(1)} MB`;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected':
        return <Circle className="w-3 h-3 fill-green-500 text-green-500" />;
      case 'disconnected':
        return <Circle className="w-3 h-3 fill-red-500 text-red-500" />;
      default:
        return <Circle className="w-3 h-3 fill-gray-400 text-gray-400" />;
    }
  };

  if (services.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Services</h2>
        </div>
        <div className="empty-state">
          <div className="empty-state-title">No Services Connected</div>
          <div className="empty-state-description">
            Services will appear here once they connect to the dashboard
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          Services ({services.length})
        </h2>
      </div>
      
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th>Heap Used</th>
              <th>RSS</th>
              <th>Event Loop</th>
              <th>Growth</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => {
              const metrics = service.lastMetrics;
              const isSelected = selectedService === service.name;
              const hasLeak = metrics?.leakDetected;
              
              return (
                <tr
                  key={service.name}
                  className={`table-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => onServiceSelect(service.name)}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="font-medium">{service.name}</span>
                      {hasLeak && (
                        <AlertTriangle className="w-4 h-4 text-red-500" title="Memory leak detected" />
                      )}
                      {metrics?.memoryGrowthMB > 0 && (
                        <TrendingUp className="w-4 h-4 text-yellow-500" title={`Growing: +${metrics.memoryGrowthMB}MB`} />
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {getStatusIcon(service.status)}
                      <span style={{ textTransform: 'capitalize' }}>
                        {service.status}
                      </span>
                    </div>
                  </td>
                  <td className="font-mono text-sm">
                    {formatMemory(metrics?.heapUsedMB)}
                  </td>
                  <td className="font-mono text-sm">
                    {formatMemory(metrics?.rssMB)}
                  </td>
                  <td className="font-mono text-sm">
                    {metrics?.eventLoopDelayMs ? `${metrics.eventLoopDelayMs.toFixed(1)}ms` : '0ms'}
                  </td>
                  <td className="font-mono text-sm">
                    {metrics?.memoryGrowthMB !== undefined ? (
                      <span className={metrics.memoryGrowthMB > 10 ? 'text-red-600' : 'text-gray-500'}>
                        {metrics.memoryGrowthMB > 0 ? '+' : ''}{formatMemory(metrics.memoryGrowthMB)}
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="text-sm text-gray-500">
                    {formatTimestamp(service.lastSeen)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {selectedService && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          backgroundColor: '#f3f4f6',
          borderRadius: '6px',
          fontSize: '0.875rem'
        }}>
          <strong>{selectedService}</strong> selected - View metrics chart below
        </div>
      )}
    </div>
  );
};

export default ServiceTable;
