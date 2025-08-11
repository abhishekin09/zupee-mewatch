import React from 'react';
import { Server, AlertTriangle, Activity, Users } from 'lucide-react';

const StatsCards = ({ stats, alerts }) => {
  if (!stats) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <span style={{ marginLeft: '0.5rem' }}>Loading stats...</span>
      </div>
    );
  }

  const criticalAlerts = alerts?.filter(alert => alert.severity === 'critical').length || 0;
  const connectedServices = stats.connectedServices || 0;
  const totalServices = stats.totalServices || 0;

  const cards = [
    {
      title: 'Connected Services',
      value: `${connectedServices}/${totalServices}`,
      icon: Server,
      color: connectedServices === totalServices ? 'text-green-600' : 'text-blue-600',
      bgColor: connectedServices === totalServices ? '#d1fae5' : '#eff6ff'
    },
    {
      title: 'Critical Alerts',
      value: criticalAlerts,
      icon: AlertTriangle,
      color: criticalAlerts > 0 ? 'text-red-600' : 'text-green-600',
      bgColor: criticalAlerts > 0 ? '#fef2f2' : '#d1fae5'
    },
    {
      title: 'Total Alerts',
      value: stats.totalAlerts || 0,
      icon: Activity,
      color: 'text-blue-600',
      bgColor: '#eff6ff'
    },
    {
      title: 'Dashboard Clients',
      value: stats.dashboardClients || 0,
      icon: Users,
      color: 'text-blue-600',
      bgColor: '#eff6ff'
    }
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '1rem'
    }}>
      {cards.map((card, index) => {
        const IconComponent = card.icon;
        return (
          <div key={index} className="card" style={{ padding: '1.5rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <p style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  fontWeight: '500'
                }}>
                  {card.title}
                </p>
                <p style={{
                  margin: '0.25rem 0 0 0',
                  fontSize: '2rem',
                  fontWeight: '700',
                  color: '#1f2937'
                }}>
                  {card.value}
                </p>
              </div>
              <div style={{
                padding: '0.75rem',
                borderRadius: '50%',
                backgroundColor: card.bgColor
              }}>
                <IconComponent className={`w-6 h-6 ${card.color}`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StatsCards;
