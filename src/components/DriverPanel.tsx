import { useState, useEffect, useRef } from 'react';
import { Bus, Schedule } from '../types.ts';
import { Play, Square, MapPin, Compass, AlertTriangle, RefreshCw, ShieldAlert, Gauge, Clock } from 'lucide-react';

// Custom hook that watches user's location via geolocation API
// and periodically streams coordinates to the server if the bus is active.
function useGeolocationStream(
  isDriving: boolean,
  busId: number | undefined,
  onCoordsUpdate: (coords: { latitude: number; longitude: number } | null) => void,
  onError: (error: string | null) => void
) {
  useEffect(() => {
    if (!isDriving || !busId) {
      onCoordsUpdate(null);
      return;
    }

    if (!navigator.geolocation) {
      onError('Geolocation is not supported by your device browser.');
      return;
    }

    let watchId: number | null = null;
    let streamInterval: any = null;
    let latestCoords: { latitude: number; longitude: number } | null = null;

    const sendUpdate = async (lat: number, lng: number) => {
      try {
        await fetch('/api/driver/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          body: JSON.stringify({ busId, latitude: lat, longitude: lng }),
        });
      } catch (err) {
        console.error('Failed to post live coordinates:', err);
      }
    };

    // 1. Continuous high-accuracy watcher to track real-time changes
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        latestCoords = { latitude, longitude };
        onCoordsUpdate({ latitude, longitude });
        onError(null);
      },
      (err) => {
        console.error('Geolocation watch failed:', err);
        onError(`GPS acquisition failed: ${err.message}. Please check device settings.`);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );

    // 2. Periodic periodic sender (every 5 seconds)
    const runPeriodicSend = async () => {
      if (latestCoords) {
        await sendUpdate(latestCoords.latitude, latestCoords.longitude);
      } else {
        // Fallback: if watchPosition hasn't fired yet, try getCurrentPosition once
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            latestCoords = { latitude, longitude };
            onCoordsUpdate({ latitude, longitude });
            await sendUpdate(latitude, longitude);
          },
          (err) => {
            console.warn('Fallback getCurrentPosition failed:', err);
          },
          { enableHighAccuracy: true, timeout: 6000 }
        );
      }
    };

    // Send immediate initial update
    runPeriodicSend();

    // Stream coordinates every 5 seconds
    streamInterval = setInterval(runPeriodicSend, 5000);

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (streamInterval) {
        clearInterval(streamInterval);
      }
    };
  }, [isDriving, busId]);
}

export default function DriverPanel() {
  const [assigned, setAssigned] = useState<boolean | null>(null);
  const [assignedBuses, setAssignedBuses] = useState<any[]>([]);
  const [bus, setBus] = useState<Bus | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isDriving, setIsDriving] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Diagnostics and SOS states
  const [odometer, setOdometer] = useState<number>(125430.5);
  const [engineHours, setEngineHours] = useState<number>(3452.1);
  const [sosActive, setSosActive] = useState(false);
  const [sosMessage, setSosMessage] = useState('');
  
  // Driving metrics
  const [shiftDuration, setShiftDuration] = useState(0);
  const timerRef = useRef<any>(null);

  // Wire up our custom geolocation streaming hook
  useGeolocationStream(
    isDriving,
    bus?.id || (bus as any)?.busId,
    setCoords,
    setError
  );

  const fetchAssignment = async (preserveSelectedBusId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/driver/assigned-bus', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAssigned(data.assigned);
        if (data.assigned) {
          if (data.buses && data.buses.length > 0) {
            setAssignedBuses(data.buses);
            
            // Find bus to activate
            let activeBus = data.buses[0];
            if (preserveSelectedBusId) {
              const found = data.buses.find((b: any) => (b.id || b.busId) === preserveSelectedBusId);
              if (found) {
                activeBus = found;
              }
            }
            
            setBus(activeBus);
            setSchedules(activeBus.schedules || []);
            setIsDriving(activeBus.isRunning);
            setOdometer(activeBus.odometer ?? 125430.5);
            setEngineHours(activeBus.engineHours ?? 3452.1);
            setSosActive(!!activeBus.sosActive);
            setSosMessage(activeBus.sosMessage || '');
          } else {
            setAssignedBuses([data.bus]);
            setBus(data.bus);
            setSchedules(data.schedules || []);
            setIsDriving(data.bus.isRunning);
            setOdometer(data.bus.odometer ?? 125430.5);
            setEngineHours(data.bus.engineHours ?? 3452.1);
            setSosActive(!!data.bus.sosActive);
            setSosMessage(data.bus.sosMessage || '');
          }
        } else {
          setAssignedBuses([]);
          setBus(null);
          setSchedules([]);
          setIsDriving(false);
          setOdometer(125430.5);
          setEngineHours(3452.1);
          setSosActive(false);
          setSosMessage('');
        }
      } else {
        setError('Failed to fetch assigned bus from system.');
        setAssigned(false);
      }
    } catch (err) {
      console.error(err);
      setError('Network error retrieving assignment details.');
      setAssigned(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignment();
  }, []);

  // Timer shift duration and dynamic vehicle metrics simulation
  useEffect(() => {
    if (isDriving) {
      timerRef.current = setInterval(() => {
        setShiftDuration(prev => prev + 1);
        setOdometer(prev => prev + 0.01);
        setEngineHours(prev => prev + (1 / 3600));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setShiftDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isDriving]);

  const handleToggleDriving = async () => {
    if (!bus) return;
    setError(null);

    const nextState = !isDriving;

    if (nextState) {
      // Starting driving - first get location
      if (!navigator.geolocation) {
        setError('Geolocation is not supported on this device.');
        return;
      }

      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setCoords({ latitude, longitude });

          try {
            const res = await fetch('/api/driver/toggle-driving', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ busId: bus.id || (bus as any).busId, isRunning: true, latitude, longitude }),
            });

            if (!res.ok) {
              const d = await res.json();
              throw new Error(d.error || 'Failed to toggle stream state.');
            }

            setIsDriving(true);
            fetchAssignment(bus.id || (bus as any).busId);
          } catch (err: any) {
            setError(err.message);
          } finally {
            setLoading(false);
          }
        },
        (err) => {
          setLoading(false);
          setError(`Failed to acquire initial GPS lock: ${err.message}. Driving cannot begin without location access.`);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      // Stopping driving
      setLoading(true);
      try {
        const res = await fetch('/api/driver/toggle-driving', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ busId: bus.id || (bus as any).busId, isRunning: false }),
        });

        if (!res.ok) {
          throw new Error('Failed to stop driving on server.');
        }

        setIsDriving(false);
        fetchAssignment(bus.id || (bus as any).busId);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleToggleSOS = async (active: boolean, message?: string) => {
    if (!bus) return;
    setError(null);
    setLoading(true);
    try {
      const busId = bus.id || (bus as any).busId;
      const res = await fetch('/api/driver/toggle-sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          busId,
          sosActive: active,
          sosMessage: active ? (message || 'EMERGENCY SOS: Driver reported urgent assistance required!') : '',
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to toggle Emergency SOS state.');
      }

      setSosActive(active);
      setSosMessage(active ? (message || 'EMERGENCY SOS: Driver reported urgent assistance required!') : '');
      
      // Update local bus object state as well
      setBus(prev => prev ? {
        ...prev,
        sosActive: active,
        sosMessage: active ? (message || 'EMERGENCY SOS: Driver reported urgent assistance required!') : ''
      } : null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  };

  if (assigned === null) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-6 w-6 border-2 border-[#141414] border-t-transparent rounded-none animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto py-8 px-4 font-sans text-[#141414]">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-[#D1D1CE] pb-5 mb-8">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-[#141414] tracking-tighter uppercase">Driver Console</h2>
          <p className="text-xs text-[#8E9299] font-medium mt-1 uppercase tracking-wider">Acquire GPS and stream dynamic location coordinates for riders.</p>
        </div>
        <button
          onClick={() => fetchAssignment()}
          disabled={isDriving}
          className="flex items-center gap-1.5 bg-[#141414] hover:bg-[#2e2e2e] disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest py-2 px-4 transition-colors cursor-pointer rounded-none"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Reload</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-600 text-red-800 p-4 rounded-none flex items-start gap-3 text-xs mb-6">
          <AlertTriangle className="h-4.5 w-4.5 flex-shrink-0 text-red-600 mt-0.5" />
          <div>
            <p className="font-bold uppercase tracking-wide font-mono text-[10px]">Operation Alert</p>
            <p className="mt-0.5 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Active Emergency SOS Alert Block */}
      {sosActive && (
        <div className="bg-red-50 border-2 border-red-600 text-red-800 p-5 mb-6 rounded-none flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md animate-pulse">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 text-red-600 animate-bounce mt-0.5" />
            <div>
              <p className="font-black uppercase tracking-widest font-mono text-xs text-red-700">🚨 EMERGENCY SOS ALARM TRANSMITTING</p>
              <p className="text-xs text-[#141414] font-medium mt-0.5">
                Dispatch and administration have been alerted. Message: <span className="italic font-mono font-bold">"{sosMessage}"</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggleSOS(false)}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white font-black uppercase font-mono text-[10px] tracking-widest px-4 py-2 border-0 rounded-none cursor-pointer self-stretch sm:self-auto text-center"
          >
            Cancel Alarm
          </button>
        </div>
      )}

      {/* Selector for multiple assigned buses */}
      {assigned && assignedBuses.length > 1 && (
        <div className="bg-white border border-[#D1D1CE] p-4 mb-6 rounded-none shadow-sm">
          <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-2">
            Select Active Bus & Route ({assignedBuses.length} Assigned)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {assignedBuses.map((b) => {
              const busId = b.id || b.busId;
              const isSelected = bus?.id === busId;
              return (
                <button
                  key={busId}
                  disabled={isDriving && !isSelected}
                  onClick={() => {
                    setBus(b);
                    setSchedules(b.schedules || []);
                    setIsDriving(b.isRunning);
                  }}
                  className={`p-3 text-left border rounded-none transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-[#141414] bg-[#F9F9F8]'
                      : 'border-[#D1D1CE] hover:border-[#141414] bg-white'
                  } ${isDriving && !isSelected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex justify-between items-center w-full mb-1">
                    <span className="text-xs font-black">{b.busNumber}</span>
                    {b.isRunning && (
                      <span className="text-[8px] bg-green-100 text-green-800 px-1.5 py-0.5 uppercase tracking-widest font-black font-mono">
                        Active
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[#8E9299] font-bold">{b.name || b.busName}</span>
                  {b.schedules && b.schedules.length > 0 && (
                    <span className="text-[9px] font-mono text-[#8E9299] mt-2 block">
                      🕒 {b.schedules[0].departureTime} - {b.schedules[0].arrivalTime}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {isDriving && (
            <p className="text-[10px] text-amber-600 font-bold mt-2 font-mono uppercase">
              ⚠️ End shift on current vehicle before switching.
            </p>
          )}
        </div>
      )}

      {/* No Assignment Notice */}
      {!assigned ? (
        <div className="bg-white border border-[#D1D1CE] p-8 text-center max-w-md mx-auto rounded-none shadow-sm">
          <div className="h-12 w-12 bg-[#F2F2F2] border border-[#D1D1CE] flex items-center justify-center mx-auto mb-4 rounded-none">
            <Compass className="h-6 w-6 text-[#141414]" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-[#141414]">No Vehicle Assigned</h3>
          <p className="text-xs text-[#8E9299] mt-2 leading-relaxed">
            Your profile email is authorized on the platform, but you have not been mapped to any bus yet. Please contact your system Administrator.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Controls Card */}
          <div className="md:col-span-2 bg-white border border-[#D1D1CE] p-6 flex flex-col justify-between rounded-none shadow-sm">
            <div>
              <span className="text-[9px] uppercase tracking-widest text-[#8E9299] font-bold font-mono">Assigned Bus Route</span>
              <h3 className="text-2xl font-black text-[#141414] tracking-tight mt-1">{bus?.busNumber}</h3>
              <p className="text-sm font-bold text-[#8E9299] mt-0.5">{bus?.name || (bus as any)?.busName}</p>

              {/* Diagnostics & Stats Grid */}
              <div className="border-t border-[#D1D1CE] pt-5 mt-6 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[9px] text-[#8E9299] uppercase tracking-widest font-black font-mono flex items-center gap-1">
                      <Gauge className="h-3 w-3" />
                      <span>Current Odometer</span>
                    </span>
                    <p className="text-base font-mono font-black text-[#141414] mt-0.5">
                      {odometer.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#8E9299] uppercase tracking-widest font-black font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>Engine operating Hours</span>
                    </span>
                    <p className="text-base font-mono font-black text-[#141414] mt-0.5">
                      {engineHours.toFixed(2)} hrs
                    </p>
                  </div>
                </div>

                {isDriving && (
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#F2F2F2]">
                    <div>
                      <span className="text-[9px] text-[#8E9299] uppercase tracking-widest font-black font-mono">Shift Timer</span>
                      <p className="text-lg font-mono font-black text-[#141414] mt-0.5">{formatTime(shiftDuration)}</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-[#8E9299] uppercase tracking-widest font-black font-mono">GPS Sync Status</span>
                      <p className="text-xs font-bold text-[#141414] mt-1.5 flex items-center gap-1.5 font-mono">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-green-500 opacity-75"></span>
                          <span className="relative inline-flex rounded-none h-2 w-2 bg-green-600"></span>
                        </span>
                        <span>ACTIVE STREAM</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Toggle Button */}
            <div className="pt-8">
              <button
                onClick={handleToggleDriving}
                disabled={loading}
                className={`w-full flex items-center justify-center gap-2.5 py-3.5 px-4 font-black uppercase tracking-widest text-xs transition-colors cursor-pointer rounded-none border-0 ${
                  isDriving
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-[#141414] hover:bg-[#2e2e2e] text-white'
                }`}
              >
                {loading ? (
                  <div className={`h-4 w-4 border-2 border-white border-t-transparent rounded-none animate-spin`} />
                ) : isDriving ? (
                  <>
                    <Square className="h-4.5 w-4.5 fill-current" />
                    <span>Stop Driving (End Session)</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4.5 w-4.5 fill-current" />
                    <span>Start Driving (Begin Streaming)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Location details card, emergency dispatcher & schedule */}
          <div className="space-y-6">
            {/* Emergency Dispatch & Quick SOS Card */}
            <div className="bg-red-50 border border-red-300 p-5 rounded-none shadow-sm">
              <div className="flex items-center gap-1.5 text-red-700 mb-2.5">
                <ShieldAlert className="h-4.5 w-4.5" />
                <h4 className="text-[10px] uppercase font-black tracking-widest font-mono">Emergency Dispatch</h4>
              </div>
              <p className="text-xs text-[#8E9299] mb-4 font-medium">
                In case of a breakdown, collision, or medical emergency, trigger an immediate SOS alert to dispatch control.
              </p>
              
              {!sosActive ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleToggleSOS(true, '🚨 MECHANICAL BREAKDOWN: Engine, transmission, or mechanical failure!')}
                      disabled={loading}
                      className="bg-white hover:bg-red-50 text-[#141414] hover:text-red-700 border border-[#D1D1CE] hover:border-red-300 py-2 px-2 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer text-left rounded-none"
                    >
                      🔧 Breakdown
                    </button>
                    <button
                      onClick={() => handleToggleSOS(true, '🚨 MEDICAL EMERGENCY: Urgent medical attention required on board!')}
                      disabled={loading}
                      className="bg-white hover:bg-red-50 text-[#141414] hover:text-red-700 border border-[#D1D1CE] hover:border-red-300 py-2 px-2 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer text-left rounded-none"
                    >
                      🚑 Medical
                    </button>
                    <button
                      onClick={() => handleToggleSOS(true, '🚨 MINOR ACCIDENT: Minor fender bender or traffic incident!')}
                      disabled={loading}
                      className="bg-white hover:bg-red-50 text-[#141414] hover:text-red-700 border border-[#D1D1CE] hover:border-red-300 py-2 px-2 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer text-left rounded-none"
                    >
                      💥 Accident
                    </button>
                    <button
                      onClick={() => handleToggleSOS(true, '🚨 ROUTE DELAY / CRITICAL: Road blockage or critical delay!')}
                      disabled={loading}
                      className="bg-white hover:bg-red-50 text-[#141414] hover:text-red-700 border border-[#D1D1CE] hover:border-red-300 py-2 px-2 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer text-left rounded-none"
                    >
                      ⚠️ Blockage
                    </button>
                  </div>
                  
                  <button
                    onClick={() => handleToggleSOS(true, '🚨 URGENT ASSISTANCE REQUIRED: Driver reported general emergency!')}
                    disabled={loading}
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 text-xs font-black uppercase tracking-widest transition-colors cursor-pointer rounded-none border-0 shadow-sm flex items-center justify-center gap-2"
                  >
                    <ShieldAlert className="h-4.5 w-4.5 fill-current" />
                    <span>Trigger Emergency SOS</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-red-600 text-white p-3 border border-red-700 font-mono text-[10px] font-bold uppercase text-center animate-pulse">
                    🚨 SOS TRANSMITTING LIVE 🚨
                  </div>
                  <button
                    onClick={() => handleToggleSOS(false)}
                    disabled={loading}
                    className="w-full bg-white hover:bg-red-50 text-red-700 border border-red-600 py-3 px-4 text-xs font-black uppercase tracking-widest transition-colors cursor-pointer rounded-none"
                  >
                    Cancel Emergency SOS
                  </button>
                </div>
              )}
            </div>

            {/* Live GPS Lock card */}
            <div className="bg-white border border-[#D1D1CE] p-5 rounded-none shadow-sm">
              <h4 className="text-[10px] uppercase font-bold tracking-widest text-[#8E9299] mb-3 font-mono">GPS Telemetry</h4>
              {coords ? (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center bg-[#F9F9F8] p-2.5 border border-[#D1D1CE] rounded-none">
                    <span className="text-[#8E9299] font-mono font-bold text-[10px]">LATITUDE</span>
                    <span className="text-[#141414] font-mono font-bold tabular-nums">{coords.latitude.toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-[#F9F9F8] p-2.5 border border-[#D1D1CE] rounded-none">
                    <span className="text-[#8E9299] font-mono font-bold text-[10px]">LONGITUDE</span>
                    <span className="text-[#141414] font-mono font-bold tabular-nums">{coords.longitude.toFixed(6)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#8E9299] font-bold uppercase tracking-wider italic">GPS receiver standby. Tap driving control to lock.</p>
              )}
            </div>

            {/* Run times list */}
            <div className="bg-white border border-[#D1D1CE] p-5 rounded-none shadow-sm">
              <h4 className="text-[10px] uppercase font-bold tracking-widest text-[#8E9299] mb-3 font-mono">Assigned Run Times</h4>
              {schedules && schedules.length > 0 ? (
                <div className="space-y-2">
                  {schedules.map((sc) => (
                    <div key={sc.id} className="bg-[#F9F9F8] border border-[#D1D1CE] p-3 rounded-none text-xs space-y-1">
                      <div className="flex justify-between text-[#141414] font-bold">
                        <span>{sc.routeFrom}</span>
                        <span>{sc.routeTo}</span>
                      </div>
                      <div className="text-[10px] font-mono text-[#8E9299] font-bold text-right pt-1 border-t border-[#F2F2F2] mt-1.5">
                        DEPARTURE: <span className="text-[#141414] font-black">{sc.departureTime}</span> | ARRIVAL: <span className="text-[#141414] font-black">{sc.arrivalTime}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#8E9299] font-bold uppercase tracking-wider italic">No schedules defined.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
