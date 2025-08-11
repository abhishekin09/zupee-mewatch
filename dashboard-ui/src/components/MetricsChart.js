import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { RefreshCw } from 'lucide-react';

const MetricsChart = ({ serviceName }) => {
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMetrics = async () => {
    if (!serviceName) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/services/${serviceName}/metrics?limit=50`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Transform data for chart
      const chartData = data.metrics.map(metric => ({
        timestamp: metric.timestamp,
        time: new Date(metric.timestamp).toLocaleTimeString(),
        heapUsed: metric.heapUsedMB,
        rss: metric.rssMB,
        heapTotal: metric.heapTotalMB,
        external: metric.externalMB,
        eventLoopDelay: metric.eventLoopDelayMs,
        leakDetected: metric.leakDetected,
        memoryGrowth: metric.memoryGrowthMB || 0
      }));
      
      setMetrics(chartData);
    } catch (err) {
      console.error('Error fetching metrics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    
    // Refresh metrics every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    
    return () => clearInterval(interval);
  }, [serviceName]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          backgroundColor: 'white',
          padding: '1rem',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: '600' }}>
            {new Date(data.timestamp).toLocaleString()}
          </p>
          <div style={{ fontSize: '0.875rem' }}>
            <p style={{ margin: '0.25rem 0', color: '#8884d8' }}>
              Heap Used: <strong>{data.heapUsed?.toFixed(1)} MB</strong>
            </p>
            <p style={{ margin: '0.25rem 0', color: '#82ca9d' }}>
              RSS: <strong>{data.rss?.toFixed(1)} MB</strong>
            </p>
            <p style={{ margin: '0.25rem 0', color: '#ffc658' }}>
              Heap Total: <strong>{data.heapTotal?.toFixed(1)} MB</strong>
            </p>
            <p style={{ margin: '0.25rem 0', color: '#ff7300' }}>
              Event Loop: <strong>{data.eventLoopDelay?.toFixed(1)} ms</strong>
            </p>
            {data.memoryGrowth !== 0 && (
              <p style={{ margin: '0.25rem 0', color: data.memoryGrowth > 0 ? '#dc2626' : '#16a34a' }}>
                Growth: <strong>{data.memoryGrowth > 0 ? '+' : ''}{data.memoryGrowth?.toFixed(1)} MB</strong>
              </p>
            )}
            {data.leakDetected && (
              <p style={{ margin: '0.25rem 0', color: '#dc2626', fontWeight: '600' }}>
                ⚠️ LEAK DETECTED
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Metrics - {serviceName}</h2>
        </div>
        <div className="loading">
          <div className="spinner"></div>
          <span style={{ marginLeft: '0.5rem' }}>Loading metrics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Metrics - {serviceName}</h2>
          <button className="btn btn-secondary" onClick={fetchMetrics}>
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
        <div className="empty-state">
          <div className="empty-state-title">Error Loading Metrics</div>
          <div className="empty-state-description">{error}</div>
        </div>
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Metrics - {serviceName}</h2>
          <button className="btn btn-secondary" onClick={fetchMetrics}>
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        <div className="empty-state">
          <div className="empty-state-title">No Metrics Available</div>
          <div className="empty-state-description">
            Metrics will appear once the service starts sending data
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          Metrics - {serviceName}
          <span style={{ fontSize: '0.875rem', fontWeight: '400', color: '#6b7280' }}>
            ({metrics.length} data points)
          </span>
        </h2>
        <button className="btn btn-secondary" onClick={fetchMetrics}>
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>
      
      <div style={{ height: '350px', width: '100%' }}>
        <ResponsiveContainer>
          <LineChart data={metrics} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="time" 
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              label={{ value: 'Memory (MB)', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            
            <Line 
              type="monotone" 
              dataKey="heapUsed" 
              stroke="#8884d8" 
              strokeWidth={2}
              name="Heap Used"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line 
              type="monotone" 
              dataKey="rss" 
              stroke="#82ca9d" 
              strokeWidth={2}
              name="RSS"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line 
              type="monotone" 
              dataKey="heapTotal" 
              stroke="#ffc658" 
              strokeWidth={2}
              name="Heap Total"
              dot={false}
              activeDot={{ r: 4 }}
            />
            
            {/* Mark leak detection points */}
            <Line 
              type="monotone" 
              dataKey="leakDetected"
              stroke="#dc2626"
              strokeWidth={0}
              dot={(props) => {
                if (props.payload.leakDetected) {
                  return (
                    <circle 
                      cx={props.cx} 
                      cy={props.cy} 
                      r={6} 
                      fill="#dc2626" 
                      stroke="#ffffff" 
                      strokeWidth={2}
                    />
                  );
                }
                return null;
              }}
              name="Leak Detection"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div style={{ 
        marginTop: '1rem', 
        fontSize: '0.875rem', 
        color: '#6b7280',
        borderTop: '1px solid #e5e7eb',
        paddingTop: '1rem'
      }}>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontWeight: '500' }}>Latest:</span>
            <span style={{ marginLeft: '0.5rem' }}>
              {metrics[metrics.length - 1]?.heapUsed?.toFixed(1)} MB heap
            </span>
          </div>
          <div>
            <span style={{ fontWeight: '500' }}>Growth:</span>
            <span style={{ 
              marginLeft: '0.5rem',
              color: metrics[metrics.length - 1]?.memoryGrowth > 10 ? '#dc2626' : '#6b7280'
            }}>
              +{metrics[metrics.length - 1]?.memoryGrowth?.toFixed(1)} MB
            </span>
          </div>
          <div>
            <span style={{ fontWeight: '500' }}>Leaks:</span>
            <span style={{ marginLeft: '0.5rem', color: '#dc2626' }}>
              {metrics.filter(m => m.leakDetected).length} detected
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsChart;
