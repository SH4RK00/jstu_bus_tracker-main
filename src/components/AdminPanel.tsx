import React, { useState, useEffect } from 'react';
import { User, Bus, Assignment } from '../types.ts';
import { Users, Bus as BusIcon, ShieldAlert, Plus, Layers, UserCheck, RefreshCw, Landmark, Compass, History } from 'lucide-react';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'buses' | 'assignments' | 'accounts' | 'logs'>('dashboard');
  
  // States
  const [metrics, setMetrics] = useState<{ totalBuses: number; totalDrivers: number; runningBuses: number; assignments: Assignment[] } | null>(null);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [busesList, setBusesList] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states - Create User
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'driver' | 'user'>('user');
  const [newUserPassword, setNewUserPassword] = useState('');

  // Form states - Create Bus
  const [newBusNumber, setNewBusNumber] = useState('');
  const [newBusName, setNewBusName] = useState('');
  const [scheds, setScheds] = useState<{ routeFrom: string; routeTo: string; departureTime: string; arrivalTime: string }[]>([
    { routeFrom: '', routeTo: '', departureTime: '', arrivalTime: '' }
  ]);

  // Form states - Assignment
  const [assignBusId, setAssignBusId] = useState<string>('');
  const [assignDriverId, setAssignDriverId] = useState<string>('');

  // Editing schedule modal/state
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [editRouteFrom, setEditRouteFrom] = useState('');
  const [editRouteTo, setEditRouteTo] = useState('');
  const [editDepartureTime, setEditDepartureTime] = useState('');
  const [editArrivalTime, setEditArrivalTime] = useState('');

  // Form states - Past Logs querying
  const [queryBusId, setQueryBusId] = useState<string>('');
  const [pastLogs, setPastLogs] = useState<{ id: number; latitude: number; longitude: number; timestamp: string; driverName: string; driverEmail: string }[]>([]);
  const [fetchingLogs, setFetchingLogs] = useState(false);

  // Fetch functions
  const fetchPastLogs = async (busId: string) => {
    if (!busId) {
      setPastLogs([]);
      return;
    }
    setFetchingLogs(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/buses/${busId}/logs`);
      if (res.ok) {
        const data = await res.json();
        setPastLogs(data);
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch historical logs');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setFetchingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'logs' && queryBusId) {
      fetchPastLogs(queryBusId);
    }
  }, [queryBusId, activeTab]);
  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/dashboard');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBuses = async () => {
    try {
      const res = await fetch('/api/buses');
      if (res.ok) {
        const data = await res.json();
        setBusesList(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDashboard();
    fetchUsers();
    fetchBuses();
  }, [activeTab]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!newUserEmail || !newUserName || !newUserPassword) {
      setError('Name, email, and password are required');
      return;
    }

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: newUserEmail, 
          name: newUserName, 
          role: newUserRole, 
          password: newUserPassword 
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create account');
      }
      setSuccessMsg(`Account for ${data.name} was successfully created!`);
      setNewUserEmail('');
      setNewUserName('');
      setNewUserRole('user');
      setNewUserPassword('');
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddSchedLine = () => {
    setScheds([...scheds, { routeFrom: '', routeTo: '', departureTime: '', arrivalTime: '' }]);
  };

  const handleRemoveSchedLine = (idx: number) => {
    setScheds(scheds.filter((_, i) => i !== idx));
  };

  const handleSchedChange = (idx: number, field: string, val: string) => {
    const updated = scheds.map((s, i) => {
      if (i === idx) {
        return { ...s, [field]: val };
      }
      return s;
    });
    setScheds(updated);
  };

  const handleCreateBus = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!newBusNumber || !newBusName) return;

    // Filter valid schedules
    const validScheds = scheds.filter(s => s.routeFrom && s.routeTo && s.departureTime && s.arrivalTime);

    try {
      const res = await fetch('/api/admin/buses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          busNumber: newBusNumber,
          name: newBusName,
          schedules: validScheds
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create bus');
      }
      setSuccessMsg(`Bus ${data.busNumber} created successfully!`);
      setNewBusNumber('');
      setNewBusName('');
      setScheds([{ routeFrom: '', routeTo: '', departureTime: '', arrivalTime: '' }]);
      fetchBuses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAssignDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!assignBusId || !assignDriverId) return;

    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          busId: parseInt(assignBusId),
          driverId: parseInt(assignDriverId)
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to assign driver');
      }
      setSuccessMsg(`Driver assigned successfully!`);
      setAssignBusId('');
      setAssignDriverId('');
      fetchDashboard();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteBus = async (busId: number) => {
    if (!window.confirm('Are you absolutely sure you want to delete this bus? This will permanently delete its schedules, logs, and driver assignments.')) {
      return;
    }
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/admin/buses/${busId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete bus');
      }
      setSuccessMsg('Bus deleted successfully!');
      fetchBuses();
      fetchDashboard();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddScheduleSubmit = async (e: React.FormEvent, busId: number) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    
    const fromInput = document.getElementById(`from-${busId}`) as HTMLInputElement;
    const toInput = document.getElementById(`to-${busId}`) as HTMLInputElement;
    const deptInput = document.getElementById(`dept-${busId}`) as HTMLInputElement;
    const arrInput = document.getElementById(`arr-${busId}`) as HTMLInputElement;

    if (!fromInput || !toInput || !deptInput || !arrInput) return;

    const routeFrom = fromInput.value;
    const routeTo = toInput.value;
    const departureTime = deptInput.value;
    const arrivalTime = arrInput.value;

    try {
      const res = await fetch(`/api/admin/buses/${busId}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeFrom, routeTo, departureTime, arrivalTime }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add schedule');
      }
      setSuccessMsg('Schedule added successfully!');
      fromInput.value = '';
      toInput.value = '';
      deptInput.value = '';
      arrInput.value = '';
      fetchBuses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule) return;
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/schedules/${editingSchedule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeFrom: editRouteFrom,
          routeTo: editRouteTo,
          departureTime: editDepartureTime,
          arrivalTime: editArrivalTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update schedule');
      }
      setSuccessMsg('Schedule updated successfully!');
      setEditingSchedule(null);
      fetchBuses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this schedule?')) {
      return;
    }
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/admin/schedules/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete schedule');
      }
      setSuccessMsg('Schedule deleted successfully!');
      fetchBuses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUnassignDriver = async (busId: number) => {
    if (!window.confirm('Are you sure you want to unassign the driver from this bus?')) {
      return;
    }
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/admin/assignments/${busId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to unassign driver');
      }
      setSuccessMsg('Driver unassigned successfully!');
      fetchDashboard();
      fetchBuses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto py-6 px-4 md:px-8 font-sans text-[#141414]">
      {/* Header and Quick Refresh */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[#D1D1CE] pb-5 mb-8">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-[#141414] tracking-tighter uppercase">System Control Panel</h2>
          <p className="text-xs text-[#8E9299] font-medium mt-1 uppercase tracking-wider">Fleet Registry, Driver Assignments, and Real-Time Logs.</p>
        </div>
        <button
          onClick={() => {
            fetchDashboard();
            fetchUsers();
            fetchBuses();
          }}
          className="flex items-center gap-2 bg-[#141414] hover:bg-[#2e2e2e] text-white text-xs font-bold uppercase tracking-widest py-2 px-4 transition-colors cursor-pointer rounded-none"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Sync Fleet</span>
        </button>
      </div>

      {/* Main Grid: Navigation tabs + Details */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 bg-[#141414] text-white p-4 h-fit border border-[#141414] rounded-none">
          <div className="hidden lg:block mb-4 pb-4 border-b border-white/10">
            <p className="text-[9px] uppercase tracking-widest text-[#8E9299] font-bold font-mono">ADMIN PRIVILEGES</p>
            <p className="text-xs font-semibold text-white mt-1">Core Operations</p>
          </div>
          
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-none text-xs font-bold uppercase tracking-wider transition-colors text-left whitespace-nowrap cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-white/10 text-white border-l-2 border-white'
                : 'bg-transparent text-[#8E9299] hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Dashboard Hub</span>
          </button>
          <button
            onClick={() => setActiveTab('buses')}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-none text-xs font-bold uppercase tracking-wider transition-colors text-left whitespace-nowrap cursor-pointer ${
              activeTab === 'buses'
                ? 'bg-white/10 text-white border-l-2 border-white'
                : 'bg-transparent text-[#8E9299] hover:text-white hover:bg-white/5'
            }`}
          >
            <BusIcon className="h-4 w-4" />
            <span>Buses & Routes</span>
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-none text-xs font-bold uppercase tracking-wider transition-colors text-left whitespace-nowrap cursor-pointer ${
              activeTab === 'assignments'
                ? 'bg-white/10 text-white border-l-2 border-white'
                : 'bg-transparent text-[#8E9299] hover:text-white hover:bg-white/5'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>Assignments</span>
          </button>
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-none text-xs font-bold uppercase tracking-wider transition-colors text-left whitespace-nowrap cursor-pointer ${
              activeTab === 'accounts'
                ? 'bg-white/10 text-white border-l-2 border-white'
                : 'bg-transparent text-[#8E9299] hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Riders & Staff</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-none text-xs font-bold uppercase tracking-wider transition-colors text-left whitespace-nowrap cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-white/10 text-white border-l-2 border-white'
                : 'bg-transparent text-[#8E9299] hover:text-white hover:bg-white/5'
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>Past Logs</span>
          </button>
        </div>

        {/* Action / Display area */}
        <div className="lg:col-span-3 space-y-6">
          {/* Notifications */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-600 text-red-800 p-4 rounded-none flex items-start gap-3 text-xs shadow-sm">
              <ShieldAlert className="h-4.5 w-4.5 flex-shrink-0 text-red-600" />
              <div>
                <p className="font-bold uppercase tracking-wide font-mono text-[10px]">Operation Alert</p>
                <p className="mt-0.5 font-medium">{error}</p>
              </div>
            </div>
          )}
          {successMsg && (
            <div className="bg-white border-l-4 border-black text-[#141414] p-4 rounded-none flex items-start gap-3 text-xs shadow-sm">
              <span className="h-2 w-2 rounded-none bg-[#141414] mt-1.5 animate-pulse flex-shrink-0"></span>
              <div>
                <p className="font-bold uppercase tracking-wide font-mono text-[10px]">Action Confirmed</p>
                <p className="mt-0.5 font-medium">{successMsg}</p>
              </div>
            </div>
          )}

          {/* Active Emergency SOS banner */}
          {metrics?.assignments?.some((ass: any) => ass.sosActive) && (
            <div className="bg-red-50 border-2 border-red-600 text-red-800 p-5 rounded-none flex items-start gap-4 shadow-md animate-pulse">
              <ShieldAlert className="h-6 w-6 flex-shrink-0 text-red-600 animate-bounce mt-0.5" />
              <div className="flex-1">
                <p className="font-black uppercase tracking-widest font-mono text-xs text-red-700">🚨 CRITICAL EMERGENCY SOS TRANSMITTING</p>
                <div className="mt-1.5 space-y-1">
                  {metrics.assignments.filter((ass: any) => ass.sosActive).map((ass: any) => (
                    <p key={ass.assignmentId} className="text-xs font-bold text-[#141414]">
                      Bus <span className="underline font-mono">{ass.busNumber}</span> ({ass.busName}) driven by <span className="underline">{ass.driverName}</span>: <span className="text-red-700 font-mono italic">"{ass.sosMessage || 'Urgent assistance required!'}"</span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Dashboard */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-[#D1D1CE] p-5 rounded-none shadow-sm">
                  <span className="text-[10px] text-[#8E9299] uppercase tracking-widest font-bold font-mono">Buses Integrated</span>
                  <p className="text-3xl font-black text-[#141414] mt-1 tabular-nums">{metrics?.totalBuses ?? 0}</p>
                </div>
                <div className="bg-white border border-[#D1D1CE] p-5 rounded-none shadow-sm">
                  <span className="text-[10px] text-[#8E9299] uppercase tracking-widest font-bold font-mono">Approved Staff</span>
                  <p className="text-3xl font-black text-[#141414] mt-1 tabular-nums">{metrics?.totalDrivers ?? 0}</p>
                </div>
                <div className="bg-white border border-[#D1D1CE] p-5 rounded-none shadow-sm">
                  <span className="text-[10px] text-[#8E9299] uppercase tracking-widest font-bold font-mono">Active Runs</span>
                  <p className="text-3xl font-black text-[#141414] mt-1 flex items-center gap-2 tabular-nums">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full bg-green-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-none h-2.5 w-2.5 bg-green-600"></span>
                    </span>
                    <span>{metrics?.runningBuses ?? 0}</span>
                  </p>
                </div>
              </div>

              {/* Running vehicles table */}
              <div className="bg-white border border-[#D1D1CE] rounded-none overflow-hidden shadow-sm">
                <div className="p-5 border-b border-[#D1D1CE] bg-[#F9F9F8]">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]">Active Assignments</h3>
                  <p className="text-xs text-[#8E9299] mt-1">Real-time status of driver logins and continuous telemetry streams.</p>
                </div>
                
                {metrics?.assignments && metrics.assignments.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#D1D1CE] bg-[#F9F9F8] text-[#8E9299] uppercase tracking-widest font-mono text-[9px] font-bold">
                          <th className="p-4">Bus No</th>
                          <th className="p-4">Route Title</th>
                          <th className="p-4">Assigned Driver</th>
                          <th className="p-4">Live Transmission</th>
                          <th className="p-4">Coordinates</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F2F2F2] text-[#141414]">
                        {metrics.assignments.map((ass) => (
                          <tr key={ass.assignmentId} className="hover:bg-[#F9F9F8] transition-colors">
                            <td className="p-4">
                              <span className="font-black font-mono tracking-wider bg-[#F2F2F2] px-2.5 py-1 border border-[#D1D1CE] text-[#141414]">
                                {ass.busNumber}
                              </span>
                            </td>
                            <td className="p-4 font-bold">
                              <div>{ass.busName}</div>
                              <div className="text-[10px] text-[#8E9299] font-normal font-mono mt-1">
                                ODO: {(ass.odometer ?? 125430.5).toLocaleString()} km | ENG: {(ass.engineHours ?? 3452.1).toFixed(1)} hrs
                              </div>
                            </td>
                            <td className="p-4">
                              <p className="font-bold text-[#141414]">{ass.driverName}</p>
                              <p className="text-[10px] text-[#8E9299] font-mono">{ass.driverEmail}</p>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col gap-1.5 items-start">
                                {ass.sosActive && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-none bg-red-600 text-white text-[9px] font-black font-mono tracking-wider animate-pulse border border-red-700">
                                    <span>🚨 EMERGENCY SOS</span>
                                  </span>
                                )}
                                {ass.isRunning ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-none bg-[#141414] text-white text-[9px] font-bold font-mono tracking-wider">
                                    <span className="h-1.5 w-1.5 bg-green-500 animate-pulse"></span>
                                    <span>STREAMING</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-none bg-[#F2F2F2] border border-[#D1D1CE] text-[9px] text-[#8E9299] font-bold font-mono tracking-wider">
                                    <span>STANDBY</span>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 font-mono text-[10px] text-[#8E9299]">
                              {ass.isRunning && ass.lastLatitude && ass.lastLongitude ? (
                                <span>{ass.lastLatitude.toFixed(5)}, {ass.lastLongitude.toFixed(5)}</span>
                              ) : (
                                <span>—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-10 text-center text-[#8E9299] text-xs uppercase tracking-wider font-bold">
                    No drivers are currently assigned.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab Content: Buses */}
          {activeTab === 'buses' && (
            <div className="space-y-6">
              {/* Form card */}
              <div className="bg-white border border-[#D1D1CE] rounded-none p-6 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-widest text-[#141414] mb-4">Register New Bus & Schedules</h3>
                <form onSubmit={handleCreateBus} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1.5">Bus Number</label>
                      <input
                        type="text"
                        placeholder="e.g. B-101"
                        value={newBusNumber}
                        onChange={(e) => setNewBusNumber(e.target.value)}
                        className="w-full bg-[#F9F9F8] text-[#141414] placeholder-[#8E9299] border border-[#D1D1CE] focus:border-[#141414] focus:bg-white focus:outline-none rounded-none py-2 px-3 text-xs font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1.5">Bus Route/Name</label>
                      <input
                        type="text"
                        placeholder="e.g. North Coast Express"
                        value={newBusName}
                        onChange={(e) => setNewBusName(e.target.value)}
                        className="w-full bg-[#F9F9F8] text-[#141414] placeholder-[#8E9299] border border-[#D1D1CE] focus:border-[#141414] focus:bg-white focus:outline-none rounded-none py-2 px-3 text-xs"
                        required
                      />
                    </div>
                  </div>

                  {/* Schedules creation */}
                  <div className="border-t border-[#D1D1CE] pt-4 mt-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] uppercase tracking-wider text-[#141414] font-bold font-mono">Route Schedules</span>
                      <button
                        type="button"
                        onClick={handleAddSchedLine}
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider border border-[#D1D1CE] bg-white text-[#141414] hover:bg-[#F2F2F2] px-2.5 py-1.5 rounded-none cursor-pointer transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add Run Time</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {scheds.map((s, idx) => (
                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end bg-[#F9F9F8] border border-[#D1D1CE] p-3.5 rounded-none">
                          <div className="sm:col-span-1.5">
                            <label className="block text-[9px] font-bold uppercase text-[#8E9299] mb-1">From Station</label>
                            <input
                              type="text"
                              placeholder="Origin"
                              value={s.routeFrom}
                              onChange={(e) => handleSchedChange(idx, 'routeFrom', e.target.value)}
                              className="w-full bg-white text-[#141414] border border-[#D1D1CE] focus:border-[#141414] focus:outline-none rounded-none py-1.5 px-2.5 text-xs"
                            />
                          </div>
                          <div className="sm:col-span-1.5">
                            <label className="block text-[9px] font-bold uppercase text-[#8E9299] mb-1">To Station</label>
                            <input
                              type="text"
                              placeholder="Destination"
                              value={s.routeTo}
                              onChange={(e) => handleSchedChange(idx, 'routeTo', e.target.value)}
                              className="w-full bg-white text-[#141414] border border-[#D1D1CE] focus:border-[#141414] focus:outline-none rounded-none py-1.5 px-2.5 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold uppercase text-[#8E9299] mb-1">Departure</label>
                            <input
                              type="text"
                              placeholder="08:30 AM"
                              value={s.departureTime}
                              onChange={(e) => handleSchedChange(idx, 'departureTime', e.target.value)}
                              className="w-full bg-white text-[#141414] border border-[#D1D1CE] focus:border-[#141414] focus:outline-none rounded-none py-1.5 px-2.5 text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold uppercase text-[#8E9299] mb-1">Arrival</label>
                            <input
                              type="text"
                              placeholder="09:15 AM"
                              value={s.arrivalTime}
                              onChange={(e) => handleSchedChange(idx, 'arrivalTime', e.target.value)}
                              className="w-full bg-white text-[#141414] border border-[#D1D1CE] focus:border-[#141414] focus:outline-none rounded-none py-1.5 px-2.5 text-xs font-mono"
                            />
                          </div>
                          {scheds.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSchedLine(idx)}
                              className="text-red-600 hover:text-red-800 text-[10px] pb-2 cursor-pointer text-left font-bold uppercase tracking-wider"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="bg-[#141414] text-white hover:bg-[#2e2e2e] transition-colors font-bold uppercase tracking-widest rounded-none py-2.5 px-6 text-xs flex items-center gap-1.5 cursor-pointer mt-4"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Bus & Schedules</span>
                  </button>
                </form>
              </div>

              {/* List Card */}
              <div className="bg-white border border-[#D1D1CE] rounded-none overflow-hidden shadow-sm">
                <div className="p-5 border-b border-[#D1D1CE] bg-[#F9F9F8]">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]">Registered Bus Roster</h3>
                  <p className="text-xs text-[#8E9299] mt-1">Operational registry profiles and defined journey runtimes.</p>
                </div>

                {busesList && busesList.length > 0 ? (
                  <div className="divide-y divide-[#F2F2F2] text-xs">
                    {busesList.map((bus) => (
                      <div key={bus.id} className="p-5 flex flex-col md:flex-row justify-between gap-6 hover:bg-[#F9F9F8] transition-colors">
                        <div className="flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[#141414] font-black font-mono tracking-wider bg-[#F2F2F2] px-2.5 py-1 border border-[#D1D1CE] rounded-none">
                                {bus.busNumber}
                              </span>
                              <span className="text-[#141414] font-bold text-sm">{bus.name}</span>
                            </div>
                            <p className="text-[10px] text-[#8E9299] font-bold uppercase mt-2">Driver: <span className="text-[#141414] font-mono">{bus.driverName || 'UNASSIGNED'}</span></p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
                              <span className="text-[10px] text-[#8E9299] font-bold uppercase">
                                ODO: <span className="text-[#141414] font-mono">{(bus.odometer ?? 125430.5).toLocaleString()} km</span>
                              </span>
                              <span className="text-[10px] text-[#8E9299] font-bold uppercase">
                                ENG HRS: <span className="text-[#141414] font-mono">{(bus.engineHours ?? 3452.1).toFixed(1)} hrs</span>
                              </span>
                              {bus.sosActive && (
                                <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 text-[9px] font-black uppercase px-2 py-0.5 border border-red-200 animate-pulse">
                                  🚨 SOS: {bus.sosMessage || 'ALERT'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-4 pt-2 border-t border-[#F2F2F2]">
                            <button
                              onClick={() => handleDeleteBus(bus.id)}
                              className="text-red-600 hover:text-red-800 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1 cursor-pointer"
                            >
                              ✕ Delete Bus Profile
                            </button>
                          </div>
                        </div>
                        
                        {/* Nested schedule list and Inline run form */}
                        <div className="flex-1 md:max-w-md">
                          <p className="text-[9px] uppercase text-[#8E9299] font-black tracking-widest mb-2 font-mono">Run Schedules</p>
                          {bus.schedules && bus.schedules.length > 0 ? (
                            <div className="space-y-1.5">
                              {bus.schedules.map((sc) => (
                                <div key={sc.id} className="bg-white border border-[#D1D1CE] p-2 rounded-none flex justify-between items-center text-[11px] text-[#141414] font-medium shadow-sm">
                                  <div>
                                    <span className="font-bold">{sc.routeFrom} ➔ {sc.routeTo}</span>
                                    <span className="text-[#8E9299] font-mono font-bold ml-2">({sc.departureTime} - {sc.arrivalTime})</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        setEditingSchedule(sc);
                                        setEditRouteFrom(sc.routeFrom);
                                        setEditRouteTo(sc.routeTo);
                                        setEditDepartureTime(sc.departureTime);
                                        setEditArrivalTime(sc.arrivalTime);
                                      }}
                                      className="text-[#141414] hover:underline font-bold uppercase text-[9px] tracking-wider"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteSchedule(sc.id)}
                                      className="text-red-600 hover:text-red-800 font-bold uppercase text-[9px] tracking-wider"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-[#8E9299] italic">No active times mapped.</p>
                          )}

                          {/* Quick inline run creator */}
                          <div className="mt-4 pt-4 border-t border-dashed border-[#D1D1CE]">
                            <span className="text-[9px] uppercase text-[#8E9299] font-black tracking-widest block mb-2 font-mono">Quick Add Schedule Run</span>
                            <form onSubmit={(e) => handleAddScheduleSubmit(e, bus.id)} className="grid grid-cols-2 gap-2 items-end">
                              <div>
                                <label className="block text-[8px] uppercase tracking-wider text-[#8E9299] font-bold mb-1">From</label>
                                <input
                                  type="text"
                                  required
                                  placeholder="Origin"
                                  className="w-full bg-[#F9F9F8] text-[#141414] border border-[#D1D1CE] rounded-none py-1 px-2 text-[10px]"
                                  id={`from-${bus.id}`}
                                />
                              </div>
                              <div>
                                <label className="block text-[8px] uppercase tracking-wider text-[#8E9299] font-bold mb-1">To</label>
                                <input
                                  type="text"
                                  required
                                  placeholder="Destination"
                                  className="w-full bg-[#F9F9F8] text-[#141414] border border-[#D1D1CE] rounded-none py-1 px-2 text-[10px]"
                                  id={`to-${bus.id}`}
                                />
                              </div>
                              <div>
                                <label className="block text-[8px] uppercase tracking-wider text-[#8E9299] font-bold mb-1">Departure</label>
                                <input
                                  type="text"
                                  required
                                  placeholder="08:30 AM"
                                  className="w-full bg-[#F9F9F8] text-[#141414] border border-[#D1D1CE] rounded-none py-1 px-2 text-[10px] font-mono"
                                  id={`dept-${bus.id}`}
                                />
                              </div>
                              <div className="flex gap-2 items-end">
                                <div className="flex-1">
                                  <label className="block text-[8px] uppercase tracking-wider text-[#8E9299] font-bold mb-1">Arrival</label>
                                  <input
                                    type="text"
                                    required
                                    placeholder="09:15 AM"
                                    className="w-full bg-[#F9F9F8] text-[#141414] border border-[#D1D1CE] rounded-none py-1 px-2 text-[10px] font-mono"
                                    id={`arr-${bus.id}`}
                                  />
                                </div>
                                <button
                                  type="submit"
                                  className="bg-[#141414] text-white hover:bg-[#2e2e2e] font-bold uppercase tracking-widest text-[9px] py-1.5 px-3 rounded-none transition-colors cursor-pointer"
                                >
                                  Add
                                </button>
                              </div>
                            </form>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-10 text-center text-[#8E9299] uppercase tracking-wider font-bold text-xs">
                    No buses are configured. Use the registration utility above.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab Content: Assignments */}
          {activeTab === 'assignments' && (
            <div className="space-y-6">
              <div className="bg-white border border-[#D1D1CE] rounded-none p-6 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-widest text-[#141414] mb-4">Assign Vehicle to Driver</h3>
                <form onSubmit={handleAssignDriver} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1.5">Select Bus Route</label>
                      <select
                        value={assignBusId}
                        onChange={(e) => setAssignBusId(e.target.value)}
                        className="w-full bg-[#F9F9F8] text-[#141414] border border-[#D1D1CE] focus:border-[#141414] focus:bg-white focus:outline-none rounded-none py-2.5 px-3 text-xs font-mono"
                        required
                      >
                        <option value="">-- Choose Bus --</option>
                        {busesList.map(b => (
                          <option key={b.id} value={b.id}>{b.busNumber} - {b.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1.5">Select Approved Driver</label>
                      <select
                        value={assignDriverId}
                        onChange={(e) => setAssignDriverId(e.target.value)}
                        className="w-full bg-[#F9F9F8] text-[#141414] border border-[#D1D1CE] focus:border-[#141414] focus:bg-white focus:outline-none rounded-none py-2.5 px-3 text-xs"
                        required
                      >
                        <option value="">-- Choose Driver --</option>
                        {usersList.filter(u => u.role === 'driver').map(u => (
                          <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="bg-[#141414] text-white hover:bg-[#2e2e2e] transition-colors font-bold uppercase tracking-widest rounded-none py-2.5 px-6 text-xs flex items-center gap-1.5 cursor-pointer mt-2"
                  >
                    <UserCheck className="h-4 w-4" />
                    <span>Confirm Assignment</span>
                  </button>
                </form>
              </div>

              {/* View current assignment layout */}
              <div className="bg-white border border-[#D1D1CE] rounded-none p-6 shadow-sm">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[#8E9299] mb-4 font-mono">Current Driver & Vehicle Mappings</h4>
                {metrics?.assignments && metrics.assignments.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {metrics.assignments.map((m) => (
                      <div key={m.assignmentId} className="border border-[#D1D1CE] bg-[#F9F9F8] p-4 rounded-none flex items-center justify-between">
                        <div>
                          <p className="text-[#141414] font-black font-mono text-sm tracking-wider">{m.busNumber}</p>
                          <p className="text-xs font-bold text-[#8E9299] mt-0.5">{m.busName}</p>
                          <button
                            onClick={() => handleUnassignDriver(m.busId)}
                            className="text-red-600 hover:text-red-800 font-bold uppercase tracking-wider text-[9px] mt-3 block hover:underline cursor-pointer"
                          >
                            Unassign Driver
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-[#141414]">{m.driverName}</p>
                          <p className="text-[10px] text-[#8E9299] font-mono mt-0.5">{m.driverEmail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#8E9299] font-bold uppercase tracking-wider italic">No driver mappings found.</p>
                )}
              </div>
            </div>
          )}

          {/* Tab Content: Accounts */}
          {activeTab === 'accounts' && (
            <div className="space-y-6">
              <div className="bg-white border border-[#D1D1CE] rounded-none p-6 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-widest text-[#141414] mb-4">Grant Credentials / Add Staff</h3>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1.5">Full Name</label>
                      <input
                        type="text"
                        placeholder="John Doe"
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        className="w-full bg-[#F9F9F8] text-[#141414] placeholder-[#8E9299] border border-[#D1D1CE] focus:border-[#141414] focus:bg-white focus:outline-none rounded-none py-2 px-3 text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1.5">Email Address</label>
                      <input
                        type="email"
                        placeholder="e.g. driver@gmail.com"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        className="w-full bg-[#F9F9F8] text-[#141414] placeholder-[#8E9299] border border-[#D1D1CE] focus:border-[#141414] focus:bg-white focus:outline-none rounded-none py-2 px-3 text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1.5">Password</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        className="w-full bg-[#F9F9F8] text-[#141414] placeholder-[#8E9299] border border-[#D1D1CE] focus:border-[#141414] focus:bg-white focus:outline-none rounded-none py-2 px-3 text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1.5">System Privilege (Role)</label>
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as any)}
                        className="w-full bg-[#F9F9F8] text-[#141414] border border-[#D1D1CE] focus:border-[#141414] focus:bg-white focus:outline-none rounded-none py-2 px-3 text-xs font-mono"
                        required
                      >
                        <option value="user">User / Rider (Default)</option>
                        <option value="driver">Driver / Operator</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="bg-[#141414] text-white hover:bg-[#2e2e2e] transition-colors font-bold uppercase tracking-widest rounded-none py-2.5 px-6 text-xs flex items-center gap-1.5 cursor-pointer mt-2"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Authorize Account</span>
                  </button>
                </form>
              </div>

              {/* View all users list */}
              <div className="bg-white border border-[#D1D1CE] rounded-none overflow-hidden shadow-sm">
                <div className="p-5 border-b border-[#D1D1CE] bg-[#F9F9F8]">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]">Approved Platform Accounts</h3>
                  <p className="text-xs text-[#8E9299] mt-1">Pre-authorized personnel roster registered in database.</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#D1D1CE] bg-[#F9F9F8] text-[#8E9299] uppercase tracking-widest font-mono text-[9px] font-bold">
                        <th className="p-4">User Profile</th>
                        <th className="p-4">Email</th>
                        <th className="p-4">Privilege Level</th>
                        <th className="p-4">Login Password Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F2F2F2] text-[#141414]">
                      {usersList.map((u) => (
                        <tr key={u.id} className="hover:bg-[#F9F9F8] transition-colors">
                          <td className="p-4 font-bold text-[#141414]">{u.name}</td>
                          <td className="p-4 font-mono text-[#8E9299]">{u.email}</td>
                          <td className="p-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 text-[9px] font-bold border rounded-none ${
                              u.role === 'admin'
                                ? 'bg-[#141414] text-white border-[#141414]'
                                : u.role === 'driver'
                                ? 'bg-[#8E9299] text-white border-[#8E9299]'
                                : 'bg-transparent text-[#8E9299] border-[#D1D1CE]'
                            }`}>
                              {u.role.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-4">
                            {u.password ? (
                              <span className="text-green-600 font-mono text-[10px] font-bold uppercase">Configured</span>
                            ) : (
                              <span className="text-amber-600 font-mono text-[10px] italic font-bold">No Password Set</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Logs */}
          {activeTab === 'logs' && (
            <div className="space-y-6">
              {/* Select Bus Form */}
              <div className="bg-white border border-[#D1D1CE] rounded-none p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1.5">Select Bus Profile to Query</label>
                    <select
                      value={queryBusId}
                      onChange={(e) => setQueryBusId(e.target.value)}
                      className="w-full bg-[#F9F9F8] text-[#141414] border border-[#D1D1CE] focus:border-[#141414] focus:bg-white focus:outline-none rounded-none py-2.5 px-3 text-xs font-mono"
                    >
                      <option value="">-- Choose Bus to Retrieve Telemetry Logs --</option>
                      {busesList.map(b => (
                        <option key={b.id} value={b.id}>{b.busNumber} - {b.name}</option>
                      ))}
                    </select>
                  </div>
                  {queryBusId && (
                    <button
                      onClick={() => fetchPastLogs(queryBusId)}
                      disabled={fetchingLogs}
                      className="flex items-center justify-center gap-2 bg-[#141414] hover:bg-[#2e2e2e] disabled:bg-gray-400 text-white text-xs font-bold uppercase tracking-widest py-3 px-5 transition-colors cursor-pointer rounded-none flex-shrink-0"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${fetchingLogs ? 'animate-spin' : ''}`} />
                      <span>{fetchingLogs ? 'Querying...' : 'Reload Telemetry'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* No Bus Chosen fallback */}
              {!queryBusId && (
                <div className="bg-white border border-[#D1D1CE] rounded-none p-12 text-center shadow-sm">
                  <div className="p-4 bg-[#F9F9F8] inline-block mb-3 border border-[#D1D1CE]">
                    <History className="h-6 w-6 text-[#8E9299]" />
                  </div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#141414]">No Bus Selected</h3>
                  <p className="text-[11px] text-[#8E9299] max-w-xs mx-auto mt-1 leading-relaxed uppercase font-mono">
                    Please choose a route or specific bus profile from the dropdown menu to fetch and analyze historical GPS traces.
                  </p>
                </div>
              )}

              {/* Querying loader */}
              {queryBusId && fetchingLogs && pastLogs.length === 0 && (
                <div className="bg-white border border-[#D1D1CE] rounded-none p-12 text-center shadow-sm">
                  <RefreshCw className="h-6 w-6 animate-spin text-[#141414] mx-auto mb-3" />
                  <p className="text-xs uppercase tracking-wider font-mono text-[#8E9299] font-bold">Retrieving historical tracking logs...</p>
                </div>
              )}

              {/* Query complete but no records */}
              {queryBusId && !fetchingLogs && pastLogs.length === 0 && (
                <div className="bg-white border border-[#D1D1CE] rounded-none p-12 text-center shadow-sm">
                  <div className="p-4 bg-red-50 inline-block mb-3 border border-red-200">
                    <ShieldAlert className="h-6 w-6 text-red-600" />
                  </div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-red-700">No Location Logs Found</h3>
                  <p className="text-[11px] text-[#8E9299] max-w-sm mx-auto mt-1 leading-relaxed uppercase font-mono">
                    This vehicle has not transmitted any coordinates yet. GPS logs are automatically populated when drivers start active shifts.
                  </p>
                </div>
              )}

              {/* Results rendering */}
              {queryBusId && pastLogs.length > 0 && (
                <div className="space-y-6">
                  {/* Analysis Metrics Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="bg-white border border-[#D1D1CE] p-4 rounded-none shadow-sm">
                      <span className="text-[10px] text-[#8E9299] uppercase tracking-widest font-bold font-mono">Data Points</span>
                      <p className="text-2xl font-black text-[#141414] mt-1 tabular-nums">{pastLogs.length}</p>
                      <p className="text-[9px] text-[#8E9299] font-mono mt-0.5 uppercase">continuous pings</p>
                    </div>

                    <div className="bg-white border border-[#D1D1CE] p-4 rounded-none shadow-sm">
                      <span className="text-[10px] text-[#8E9299] uppercase tracking-widest font-bold font-mono">Unique Drivers</span>
                      <p className="text-2xl font-black text-[#141414] mt-1 truncate">
                        {Array.from(new Set(pastLogs.map(l => l.driverName))).length}
                      </p>
                      <p className="text-[9px] text-[#8E9299] font-mono mt-0.5 uppercase">authorized operators</p>
                    </div>

                    <div className="bg-white border border-[#D1D1CE] p-4 rounded-none shadow-sm sm:col-span-2">
                      <span className="text-[10px] text-[#8E9299] uppercase tracking-widest font-bold font-mono">Time Span Analysed</span>
                      <p className="text-md font-black text-[#141414] mt-1.5 truncate">
                        {(() => {
                          const youngest = new Date(pastLogs[0].timestamp).getTime();
                          const oldest = new Date(pastLogs[pastLogs.length - 1].timestamp).getTime();
                          const diffMs = Math.abs(youngest - oldest);
                          const diffMins = Math.round(diffMs / 60000);
                          if (diffMins < 1) return 'Less than a minute';
                          if (diffMins < 60) return `${diffMins} Minute(s)`;
                          const hrs = Math.floor(diffMins / 60);
                          const mins = diffMins % 60;
                          return `${hrs} hr ${mins} min`;
                        })()}
                      </p>
                      <p className="text-[9px] text-[#8E9299] font-mono mt-1 uppercase">
                        {new Date(pastLogs[pastLogs.length - 1].timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(pastLogs[0].timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </p>
                    </div>
                  </div>

                  {/* Table of logs */}
                  <div className="bg-white border border-[#D1D1CE] rounded-none overflow-hidden shadow-sm">
                    <div className="p-5 border-b border-[#D1D1CE] bg-[#F9F9F8] flex justify-between items-center">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]">Historical GPS Trace Feed</h3>
                        <p className="text-xs text-[#8E9299] mt-1">Detailed breakdown of past telemetry checkpoints stored in Postgres.</p>
                      </div>
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider bg-[#141414] text-white px-2 py-0.5">
                        Latest {pastLogs.length} Records
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#D1D1CE] bg-[#F9F9F8] text-[#8E9299] uppercase tracking-widest font-mono text-[9px] font-bold">
                            <th className="p-4">Timestamp</th>
                            <th className="p-4">Operating Driver</th>
                            <th className="p-4">Latitude</th>
                            <th className="p-4">Longitude</th>
                            <th className="p-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F2F2F2] text-[#141414]">
                          {pastLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-[#F9F9F8] transition-colors">
                              <td className="p-4 font-mono font-bold text-[#141414]">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="p-4">
                                <p className="font-bold text-[#141414]">{log.driverName}</p>
                                <p className="text-[10px] text-[#8E9299] font-mono">{log.driverEmail}</p>
                              </td>
                              <td className="p-4 font-mono text-[11px] font-semibold">{log.latitude.toFixed(6)}</td>
                              <td className="p-4 font-mono text-[11px] font-semibold">{log.longitude.toFixed(6)}</td>
                              <td className="p-4 text-right">
                                <a
                                  href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block border border-[#D1D1CE] bg-white text-[#141414] hover:bg-[#F2F2F2] hover:border-[#141414] text-[9px] font-black uppercase tracking-wider px-2.5 py-1.5 transition-colors cursor-pointer"
                                >
                                  Pinpoint Map
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Editing Schedule Modal Overlay */}
      {editingSchedule && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#D1D1CE] max-w-sm w-full p-6 shadow-xl rounded-none">
            <h4 className="text-xs font-black uppercase tracking-widest text-[#141414] mb-4">Edit Schedule Run</h4>
            <form onSubmit={handleUpdateSchedule} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1">From Station</label>
                <input
                  type="text"
                  value={editRouteFrom}
                  onChange={(e) => setEditRouteFrom(e.target.value)}
                  className="w-full bg-[#F9F9F8] text-[#141414] border border-[#D1D1CE] focus:border-[#141414] focus:outline-none rounded-none py-2 px-3 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1">To Station</label>
                <input
                  type="text"
                  value={editRouteTo}
                  onChange={(e) => setEditRouteTo(e.target.value)}
                  className="w-full bg-[#F9F9F8] text-[#141414] border border-[#D1D1CE] focus:border-[#141414] focus:outline-none rounded-none py-2 px-3 text-xs"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1">Departure Time</label>
                  <input
                    type="text"
                    value={editDepartureTime}
                    onChange={(e) => setEditDepartureTime(e.target.value)}
                    className="w-full bg-[#F9F9F8] text-[#141414] border border-[#D1D1CE] focus:border-[#141414] focus:outline-none rounded-none py-2 px-3 text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1">Arrival Time</label>
                  <input
                    type="text"
                    value={editArrivalTime}
                    onChange={(e) => setEditArrivalTime(e.target.value)}
                    className="w-full bg-[#F9F9F8] text-[#141414] border border-[#D1D1CE] focus:border-[#141414] focus:outline-none rounded-none py-2 px-3 text-xs font-mono"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingSchedule(null)}
                  className="border border-[#D1D1CE] bg-white text-[#141414] hover:bg-[#F2F2F2] px-4 py-2 font-bold uppercase text-[10px] tracking-widest rounded-none cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#141414] text-white hover:bg-[#2e2e2e] px-4 py-2 font-bold uppercase text-[10px] tracking-widest rounded-none cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
