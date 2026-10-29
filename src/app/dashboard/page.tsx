'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  ShieldAlert, ShieldCheck, Zap, Activity, Users, 
  Fingerprint, MousePointer2, Cpu, Globe, LogOut, Plus, CheckCircle2
} from 'lucide-react';

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'analytics' | 'sites'>('analytics');
  
  // Data States
  const [trafficData, setTrafficData] = useState([]);
  const [stats, setStats] = useState({ total: 0, bots: 0, trustPass: 0, avgLatency: 0 });
  const [riskData, setRiskData] = useState([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New Site State
  const [newDomain, setNewDomain] = useState('');
  const [addingSite, setAddingSite] = useState(false);
  
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        fetchAnalytics();
        fetchSites();
      } else {
        router.push('/login');
      }
    } catch (e) {
      router.push('/login');
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics');
      if (res.ok) {
        const data = await res.json();
        setTrafficData(data.trafficData);
        setStats(data.stats);
        setRiskData(data.riskData);
        setRecentLogs(data.recentLogs);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchSites = async () => {
    const res = await fetch('/api/sites');
    if (res.ok) {
      const data = await res.json();
      setSites(data.sites);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingSite(true);
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain })
      });
      if (res.ok) {
        setNewDomain('');
        fetchSites();
      }
    } finally {
      setAddingSite(false);
    }
  };

  const handleVerifySite = async (siteId: string) => {
    try {
      const res = await fetch(`/api/sites/${siteId}/verify`, { method: 'POST' });
      if (res.ok) {
        fetchSites();
        fetchAnalytics();
      } else {
        alert('Verification failed. Are you sure you added the TXT record?');
      }
    } catch (e) {
      alert('Error verifying site.');
    }
  };

  if (!mounted || !user) return null;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-blue-500/30">
      
      {/* HEADER NAVBAR */}
      <nav className="border-b border-zinc-800 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.5)]">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl tracking-tight">biCaptcha</span>
            </div>
            
            <div className="hidden md:flex gap-1 ml-4 border-l border-zinc-800 pl-6">
              <button 
                onClick={() => setActiveTab('analytics')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'analytics' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
              >
                Analytics
              </button>
              <button 
                onClick={() => setActiveTab('sites')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'sites' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
              >
                My Sites
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="px-3 py-1.5 rounded-full bg-zinc-800/50 border border-zinc-700/50 text-xs text-zinc-300 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              {user.name || user.email}
            </div>
            <button onClick={handleLogout} className="text-zinc-400 hover:text-white p-2 rounded-lg hover:bg-zinc-800 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {activeTab === 'sites' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8">
              <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-500">
                Site Management
              </h1>
              <p className="text-zinc-400 mt-1">Add domains and verify ownership to start protecting them.</p>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 mb-8">
              <h3 className="text-lg font-medium mb-4">Add New Domain</h3>
              <form onSubmit={handleAddSite} className="flex gap-4">
                <input 
                  type="text" 
                  placeholder="e.g. example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
                  required
                />
                <button 
                  type="submit" 
                  disabled={addingSite}
                  className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-500 transition-colors flex items-center gap-2 font-medium"
                >
                  <Plus className="w-5 h-5" /> Add Domain
                </button>
              </form>
            </div>

            <div className="space-y-4">
              {sites.map(site => (
                <div key={site.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <Globe className="w-5 h-5 text-zinc-400" />
                      <h3 className="text-xl font-medium">{site.domain}</h3>
                      {site.isVerified ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Verified</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20">Pending Verification</span>
                      )}
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="text-sm">
                        <span className="text-zinc-500 w-20 inline-block">SiteKey:</span>
                        <code className="bg-zinc-950 px-2 py-1 rounded text-blue-400 border border-zinc-800 font-mono text-xs select-all">{site.siteKey}</code>
                      </div>
                      {/* For security reasons, don't display SecretKey fully, but it's okay for POC */}
                      <div className="text-sm">
                        <span className="text-zinc-500 w-20 inline-block">SecretKey:</span>
                        <code className="bg-zinc-950 px-2 py-1 rounded text-red-400 border border-zinc-800 font-mono text-xs select-all">{site.secretKey}</code>
                      </div>
                    </div>
                  </div>
                  
                  {!site.isVerified && (
                    <div className="bg-orange-500/5 border border-orange-500/10 rounded-lg p-4 max-w-sm w-full">
                      <p className="text-sm text-zinc-300 mb-3">To verify ownership, add the following TXT record to your DNS settings:</p>
                      <code className="block bg-zinc-950 px-3 py-2 rounded text-orange-400 border border-zinc-800 font-mono text-xs mb-3 break-all select-all">
                        bicaptcha-verification={site.siteKey}
                      </code>
                      <button 
                        onClick={() => handleVerifySite(site.id)}
                        className="w-full bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium border border-zinc-700"
                      >
                        Verify DNS Record Now
                      </button>
                    </div>
                  )}
                </div>
              ))}
              
              {sites.length === 0 && (
                <div className="text-center py-12 bg-zinc-900/30 border border-zinc-800/50 rounded-xl border-dashed">
                  <Globe className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400">You haven't added any domains yet.</p>
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* PAGE TITLE */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-500">
                Real-time Analytics
              </h1>
              <p className="text-zinc-400 mt-1">Monitor bot attacks, traffic anomalies, and user verifications across your network.</p>
            </div>

            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
              </div>
            ) : sites.filter(s => s.isVerified).length === 0 ? (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-8 text-center max-w-2xl mx-auto mt-12">
                <ShieldCheck className="w-12 h-12 text-blue-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-blue-100 mb-2">Welcome to biCaptcha!</h3>
                <p className="text-blue-200/70 mb-6">To see analytics, you must first add a domain and verify it via DNS in the "My Sites" tab.</p>
                <button 
                  onClick={() => setActiveTab('sites')}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-500 font-medium"
                >
                  Go to My Sites
                </button>
              </div>
            ) : (
              <>
                {/* KPI CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-blue-500/20"></div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-zinc-400 text-sm font-medium mb-1">Total Requests</p>
                        <h3 className="text-3xl font-bold text-zinc-100">{stats.total}</h3>
                      </div>
                      <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
                        <Globe className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-red-500/20"></div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-zinc-400 text-sm font-medium mb-1">Blocked Bots</p>
                        <h3 className="text-3xl font-bold text-zinc-100">{stats.bots}</h3>
                      </div>
                      <div className="p-2 bg-red-500/10 rounded-lg text-red-400 border border-red-500/20">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-orange-500/20"></div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-zinc-400 text-sm font-medium mb-1">Trust Pass Logins</p>
                        <h3 className="text-3xl font-bold text-zinc-100">{stats.trustPass}</h3>
                      </div>
                      <div className="p-2 bg-orange-500/10 rounded-lg text-orange-400 border border-orange-500/20">
                        <Fingerprint className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-emerald-500/20"></div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-zinc-400 text-sm font-medium mb-1">Avg. Latency</p>
                        <h3 className="text-3xl font-bold text-zinc-100">{stats.avgLatency}ms</h3>
                      </div>
                      <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20">
                        <Zap className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                </div>

                {/* CHARTS SECTION */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                  
                  {/* Main Area Chart */}
                  <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                    <h3 className="text-lg font-medium mb-6 flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-400" />
                      Traffic Analysis (30 Days)
                    </h3>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trafficData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorHuman" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorBot" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorPass" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis dataKey="date" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                            itemStyle={{ fontSize: '13px' }}
                            labelStyle={{ color: '#a1a1aa', marginBottom: '8px', fontSize: '12px' }}
                          />
                          <Area type="monotone" dataKey="Human" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorHuman)" />
                          <Area type="monotone" dataKey="Bot" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorBot)" />
                          <Area type="monotone" dataKey="TrustPass" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorPass)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Donut Chart */}
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 flex flex-col">
                    <h3 className="text-lg font-medium mb-6 flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-purple-400" />
                      Risk Distribution
                    </h3>
                    <div className="flex-1 flex flex-col justify-center relative">
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={riskData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                              stroke="none"
                            >
                              {riskData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                              itemStyle={{ color: '#fff' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      
                      <div className="mt-6 space-y-3">
                        {riskData.map((item: any, i: number) => (
                          <div key={i} className="flex justify-between items-center text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                              <span className="text-zinc-300">{item.name}</span>
                            </div>
                            <span className="font-medium">{item.value}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>

                {/* RECENT ACTIVITY TABLE */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <MousePointer2 className="w-5 h-5 text-emerald-400" />
                      Live Validation Stream
                    </h3>
                    <div className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded">Real-time DB logs</div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-zinc-400">
                      <thead className="bg-zinc-900/80 text-zinc-500 border-b border-zinc-800">
                        <tr>
                          <th className="px-6 py-4 font-medium">IP Address</th>
                          <th className="px-6 py-4 font-medium">Result</th>
                          <th className="px-6 py-4 font-medium">Risk Score</th>
                          <th className="px-6 py-4 font-medium">Detection Reason</th>
                          <th className="px-6 py-4 font-medium text-right">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {recentLogs.length === 0 && (
                          <tr><td colSpan={5} className="px-6 py-8 text-center">No validations logged yet.</td></tr>
                        )}
                        {recentLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-zinc-800/20 transition-colors">
                            <td className="px-6 py-4 flex items-center gap-2">
                              <span className="text-lg">{log.country === 'Unknown' ? '🌍' : log.country}</span>
                              <span className="font-mono text-zinc-300">{log.ip}</span>
                            </td>
                            <td className="px-6 py-4">
                              {log.type === 'Human' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><ShieldCheck className="w-3.5 h-3.5"/> Verified</span>}
                              {log.type === 'Bot' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/20"><ShieldAlert className="w-3.5 h-3.5"/> Blocked</span>}
                              {log.type === 'TrustPass' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20"><Fingerprint className="w-3.5 h-3.5"/> Trust Pass</span>}
                            </td>
                            <td className="px-6 py-4 font-mono">
                              <span className={log.score > 0.6 ? 'text-red-400' : (log.score > 0 ? 'text-emerald-400' : 'text-orange-400')}>
                                {log.score.toFixed(2)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-zinc-300">{log.reason}</td>
                            <td className="px-6 py-4 text-right text-zinc-500">{log.time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
