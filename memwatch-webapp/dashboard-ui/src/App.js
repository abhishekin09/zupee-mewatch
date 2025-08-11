import React, { useState, useEffect, useCallback } from 'react';
import ServiceTable from './components/ServiceTable';
import MetricsChart from './components/MetricsChart';
import AlertsPanel from './components/AlertsPanel';
import Header from './components/Header';
import StatsCards from './components/StatsCards';
import SnapshotComparison from './components/SnapshotComparison';
import './App.css';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:4000/dashboard';

function App() {
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [ws, setWs] = useState(null);
  const [activeTab, setActiveTab] = useState('monitoring');

  const connectWebSocket = useCallback(() => {
    const websocket = new WebSocket(WS_URL);
    
    websocket.onopen = () => {
      console.log('Connected to dashboard server');
      setConnectionStatus('connected');
    };

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.onclose = () => {
      console.log('Disconnected from dashboard server');
      setConnectionStatus('disconnected');
      
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        if (connectionStatus !== 'connected') {
          connectWebSocket();
        }
      }, 3000);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
    };

    setWs(websocket);
    
    return websocket;
  }, [connectionStatus]);

  const handleWebSocketMessage = (message) => {
    switch (message.type) {
      case 'initial':
        setServices(message.services || []);
        setAlerts(message.alerts || []);
        break;
        
      case 'serviceRegistered':
        fetchServices();
        break;
        
      case 'serviceUpdate':
        setServices(prev => prev.map(service => 
          service.name === message.service 
            ? { ...service, status: message.status }
            : service
        ));
        break;
        
      case 'metricsUpdate':
        // Update the service with new metrics
        setServices(prev => prev.map(service => 
          service.name === message.service 
            ? { ...service, lastMetrics: message }
            : service
        ));
        break;
        
      case 'leakAlert':
      case 'snapshotAlert':
        setAlerts(prev => [message.alert, ...prev.slice(0, 49)]); // Keep last 50
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await fetch('/api/services');
      const data = await response.json();
      setServices(data);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/alerts?limit=50');
      const data = await response.json();
      setAlerts(data.alerts);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };

  useEffect(() => {
    // Initial data fetch
    fetchServices();
    fetchStats();
    fetchAlerts();
    
    // Connect WebSocket
    const websocket = connectWebSocket();
    
    // Periodic stats refresh
    const statsInterval = setInterval(fetchStats, 30000); // Every 30 seconds
    
    return () => {
      if (websocket) {
        websocket.close();
      }
      clearInterval(statsInterval);
    };
  }, [connectWebSocket]);

  return (
    <div className="app">
      <Header connectionStatus={connectionStatus} />
      
      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button 
          className={`tab-button ${activeTab === 'monitoring' ? 'active' : ''}`}
          onClick={() => setActiveTab('monitoring')}
        >
          Real-time Monitoring
        </button>
        <button 
          className={`tab-button ${activeTab === 'snapshots' ? 'active' : ''}`}
          onClick={() => setActiveTab('snapshots')}
        >
          Snapshot Analysis
        </button>
      </div>
      
      <main className="main-content">
        {activeTab === 'monitoring' && (
          <div className="dashboard-grid">
            {/* Stats Cards */}
            <div className="stats-section">
              <StatsCards stats={stats} alerts={alerts} />
            </div>

            {/* Services Table */}
            <div className="services-section">
              <ServiceTable 
                services={services}
                selectedService={selectedService}
                onServiceSelect={setSelectedService}
              />
            </div>

            {/* Metrics Chart */}
            {selectedService && (
            <div className="chart-section">
              <MetricsChart serviceName={selectedService} />
            </div>
          )}

            {/* Alerts Panel */}
            <div className="alerts-section">
              <AlertsPanel 
                alerts={selectedService ? alerts.filter(alert => alert.service === selectedService) : alerts} 
                selectedService={selectedService}
              />
            </div>
          </div>
        )}
        
        {activeTab === 'snapshots' && (
          <SnapshotComparison websocket={ws} />
        )}
      </main>
    </div>
  );
}

export default App;
