import { useState, useEffect, useRef } from 'react';
import { Bus, Schedule, LocationLog } from '../types.ts';
import MapComponent from './MapComponent.tsx';
import { Bus as BusIcon, Search, Compass, Eye, MapPin, Clock, ArrowRight } from 'lucide-react';

export default function UserPanel() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [search, setSearch] = useState('');
  const [selectedBusId, setSelectedBusId] = useState<number | null>(null);
  const [history, setHistory] = useState<LocationLog[]>([]);
  const [loading, setLoading] = useState(false);

  // Derive selected bus dynamically
  const selectedBus = buses.find((b: Bus) => b.id === selectedBusId) || null;

  const pollIntervalRef = useRef<any>(null);

  // Fetch all buses
  const fetchBuses = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await fetch('/api/buses');
      if (res.ok) {
        const data = await res.json();
        setBuses(data);
      }
    } catch (err) {
      console.error('Failed to load buses:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  // Fetch selected bus history trace
  const fetchHistory = async (busId: number) => {
    try {
      const res = await fetch(`/api/buses/${busId}/history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data || []);
      }
    } catch (err) {
      console.error('Failed to load history logs:', err);
    }
  };

  useEffect(() => {
    fetchBuses();
    // Poll buses list and live positions every 4 seconds
    pollIntervalRef.current = setInterval(() => {
      fetchBuses(true);
    }, 4000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Poll history of selected bus periodically
  useEffect(() => {
    if (selectedBusId) {
      fetchHistory(selectedBusId);
      const histInterval = setInterval(() => {
        fetchHistory(selectedBusId);
      }, 4000);
      return () => clearInterval(histInterval);
    } else {
      setHistory([]);
    }
  }, [selectedBusId]);

  // Handle bus selection
  const handleSelectBus = (bus: Bus) => {
    setSelectedBusId(bus.id);
    setHistory([]);
    fetchHistory(bus.id);
  };

  // Filter list
  const filteredBuses = buses.filter(b => 
    b.busNumber.toLowerCase().includes(search.toLowerCase()) ||
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full h-[calc(100vh-64px)] max-w-7xl mx-auto flex flex-col md:flex-row gap-6 p-4 md:p-6 font-sans text-[#141414]">
      {/* Map visualizer - Left side */}
      <div className="flex-1 flex flex-col h-full space-y-4">
        {/* Active tracking banner */}
        {selectedBus && (
          <div className="bg-white border border-[#D1D1CE] p-4 flex items-center justify-between rounded-none shadow-sm">
            <div className="flex items-center gap-3">
              <span className="bg-[#F2F2F2] text-[#141414] font-black font-mono text-xs px-2.5 py-1 border border-[#D1D1CE] rounded-none">
                {selectedBus.busNumber}
              </span>
              <div>
                <h3 className="text-sm font-bold text-[#141414]">{selectedBus.name}</h3>
                <p className="text-[10px] text-[#8E9299] font-bold uppercase mt-0.5">Operator: <span className="font-mono text-[#141414]">{selectedBus.driverName || 'UNASSIGNED'}</span></p>
              </div>
            </div>

            <div>
              {selectedBus.isRunning ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#141414] text-white text-[9px] font-bold font-mono tracking-wider rounded-none">
                  <span className="h-1.5 w-1.5 bg-green-500 animate-pulse"></span>
                  <span>LIVE TRACKING</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F2F2F2] border border-[#D1D1CE] text-[9px] text-[#8E9299] font-bold font-mono tracking-wider rounded-none">
                  <span>STANDBY (OFFLINE)</span>
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 relative min-h-[300px]">
          <MapComponent
            selectedBusId={selectedBus?.id}
            buses={buses}
            latitude={selectedBus ? selectedBus.lastLatitude : null}
            longitude={selectedBus ? selectedBus.lastLongitude : null}
            busNumber={selectedBus?.busNumber}
            busName={selectedBus?.name}
            history={history}
            onSelectBus={handleSelectBus}
          />
        </div>
      </div>

      {/* Roster & Detail Sidebar - Right side */}
      <div className="w-full md:w-80 h-full flex flex-col space-y-4">
        {/* Search */}
        <div className="bg-white border border-[#D1D1CE] p-4 rounded-none shadow-sm space-y-3">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8E9299] font-mono">Select Route</h3>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8E9299]" />
            <input
              type="text"
              placeholder="Search bus routes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#F9F9F8] text-[#141414] placeholder-[#8E9299] text-xs pl-9 pr-4 py-2.5 border border-[#D1D1CE] focus:border-[#141414] focus:bg-white focus:outline-none rounded-none font-mono"
            />
          </div>
        </div>

        {/* Bus List */}
        <div className="flex-1 bg-white border border-[#D1D1CE] rounded-none overflow-y-auto max-h-[400px] md:max-h-none shadow-sm">
          {loading && buses.length === 0 ? (
            <div className="p-8 text-center">
              <div className="h-5 w-5 border-2 border-[#141414] border-t-transparent rounded-none animate-spin mx-auto mb-2" />
              <span className="text-[10px] text-[#8E9299] font-mono font-bold uppercase">Syncing route roster...</span>
            </div>
          ) : filteredBuses.length > 0 ? (
            <div className="divide-y divide-[#F2F2F2]">
                  {filteredBuses.map((bus) => {
                const isActive = selectedBus?.id === bus.id;
                return (
                  <button
                    key={bus.id}
                    onClick={() => handleSelectBus(bus)}
                    onTouchStart={() => handleSelectBus(bus)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectBus(bus);
                      }
                    }}
                    className={`w-full p-4 flex flex-col text-left transition-colors hover:bg-[#F9F9F8] cursor-pointer border-l-2 ${
                      isActive ? 'border-[#141414] bg-[#F2F2F2]' : 'border-transparent bg-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-black font-mono tracking-wider bg-[#F2F2F2] px-2 py-0.5 border border-[#D1D1CE] text-[#141414] rounded-none flex-shrink-0">
                          {bus.busNumber}
                        </span>
                        <h4 className="text-xs font-bold text-[#141414] truncate">{bus.name}</h4>
                      </div>
                      
                      {(() => {
                        const online = bus.isRunning && bus.lastUpdated && (Date.now() - new Date(bus.lastUpdated).getTime() < 15000);
                        return online ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 border border-green-200 text-green-700 text-[8px] font-black font-mono uppercase tracking-wider rounded-none flex-shrink-0">
                            <span className="h-1 w-1 bg-green-500 animate-pulse"></span>
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-[#F2F2F2] border border-[#D1D1CE] text-gray-500 text-[8px] font-black font-mono uppercase tracking-wider rounded-none flex-shrink-0">
                            Offline
                          </span>
                        );
                      })()}
                    </div>

                    {/* Metadata line: operator and dynamic heartbeat seen indicator */}
                    <div className="flex items-center justify-between w-full mt-2 text-[9px] font-mono text-[#8E9299]">
                      <span className="truncate max-w-[140px]">Driver: {bus.driverName || 'Unassigned'}</span>
                      {bus.lastUpdated && (
                        <span>
                          Seen:{' '}
                          {(() => {
                            const diffMs = Date.now() - new Date(bus.lastUpdated).getTime();
                            const diffSecs = Math.floor(diffMs / 1000);
                            if (diffSecs < 1) return 'now';
                            if (diffSecs < 60) return `${diffSecs}s ago`;
                            const diffMins = Math.floor(diffSecs / 60);
                            if (diffMins < 60) return `${diffMins}m` + (diffMins === 1 ? '' : 's') + ' ago';
                            return new Date(bus.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          })()}
                        </span>
                      )}
                    </div>

                    {/* Schedules nested peek */}
                    {bus.schedules && bus.schedules.length > 0 && (
                      <div className="mt-3 space-y-1 w-full pt-2 border-t border-[#F2F2F2]/40">
                        {bus.schedules.slice(0, 2).map((sc) => (
                          <div key={sc.id} className="flex justify-between text-[10px] text-[#141414] font-bold">
                            <span className="text-[#8E9299]">{sc.routeFrom} ➔ {sc.routeTo}</span>
                            <span className="text-[#141414] font-mono">{sc.departureTime}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#8E9299] font-bold uppercase tracking-wider font-mono">
              No matching routes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
