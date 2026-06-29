import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Bus } from '../types.ts';
import { animate } from 'motion';
import { Layers, Check, Globe, Map as MapIcon } from 'lucide-react';

interface MapComponentProps {
  selectedBusId?: number | null;
  buses?: Bus[];
  latitude: number | null;
  longitude: number | null;
  busNumber?: string;
  busName?: string;
  history?: { latitude: number; longitude: number }[];
  onSelectBus?: (bus: Bus) => void;
}

// Custom animated marker wrapper using motion to interpolate coordinates smoothly
interface AnimatedMarkerProps {
  position: [number, number];
  icon: L.DivIcon;
  eventHandlers?: any;
  children?: React.ReactNode;
  key?: React.Key;
}

function AnimatedMarker({ position, icon, eventHandlers, children }: AnimatedMarkerProps) {
  const [lat, setLat] = useState(position[0]);
  const [lng, setLng] = useState(position[1]);

  useEffect(() => {
    const controlsLat = animate(lat, position[0], {
      duration: 1.5,
      ease: [0.25, 0.1, 0.25, 1], // custom smooth cubic-bezier curve
      onUpdate: (latest) => setLat(latest),
    });

    const controlsLng = animate(lng, position[1], {
      duration: 1.5,
      ease: [0.25, 0.1, 0.25, 1],
      onUpdate: (latest) => setLng(latest),
    });

    return () => {
      controlsLat.stop();
      controlsLng.stop();
    };
  }, [position[0], position[1]]);

  return (
    <Marker position={[lat, lng]} icon={icon} eventHandlers={eventHandlers}>
      {children}
    </Marker>
  );
}

// Custom view helper to dynamically manage map pan/zoom/bounds smoothly
function MapViewUpdater({
  center,
  zoom,
  points,
  selectedBusId,
}: {
  center: [number, number];
  zoom: number;
  points?: [number, number][];
  selectedBusId?: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (points && points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else {
      map.setView(center, zoom);
    }
  }, [selectedBusId, points ? points.length : 0]);

  return null;
}

export default function MapComponent({
  selectedBusId,
  buses = [],
  latitude,
  longitude,
  busNumber,
  busName,
  history,
  onSelectBus,
}: MapComponentProps) {
  const [activeBase, setActiveBase] = useState<'street' | 'satellite'>('street');
  const [showOverlay, setShowOverlay] = useState<boolean>(false);
  const [layersOpen, setLayersOpen] = useState<boolean>(false);

  // Helper to validate coordinates
  const isValidCoordinate = (lat: any, lng: any) => {
    return (
      lat !== null &&
      lng !== null &&
      lat !== undefined &&
      lng !== undefined &&
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !isNaN(lat) &&
      !isNaN(lng) &&
      lat !== 0 &&
      lng !== 0 &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  };

  // Map history to polyline positions for the active path
  const polylinePoints = useMemo<[number, number][]>(() => {
    if (!history || history.length === 0) return [];
    return history
      .filter((h) => isValidCoordinate(h.latitude, h.longitude))
      .map((h) => [h.latitude, h.longitude] as [number, number]);
  }, [history]);

  // Center coordinate determination
  const hasSelectedActive = isValidCoordinate(latitude, longitude);
  const centerLat = hasSelectedActive ? latitude! : 13.7563;
  const centerLng = hasSelectedActive ? longitude! : 100.5018;
  const centerPosition = useMemo<[number, number]>(() => [centerLat, centerLng], [centerLat, centerLng]);

  // Compute movement heading in degrees dynamically based on recent history
  const heading = useMemo(() => {
    if (!isValidCoordinate(latitude, longitude)) return 0;
    if (!history || history.length === 0) return 0;

    // Search from latest history records for a point that has different coordinates
    for (let i = 0; i < history.length; i++) {
      const prevLat = history[i].latitude;
      const prevLng = history[i].longitude;
      
      const latDiff = latitude! - prevLat;
      const lngDiff = longitude! - prevLng;
      const distanceSq = latDiff * latDiff + lngDiff * lngDiff;
      
      // If coordinates are sufficiently different, compute bearing
      if (distanceSq > 0.0000001) {
        const dLon = (longitude! - prevLng) * Math.PI / 180;
        const lat1Rad = prevLat * Math.PI / 180;
        const lat2Rad = latitude! * Math.PI / 180;
        
        const y = Math.sin(dLon) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
        
        const brng = Math.atan2(y, x) * 180 / Math.PI;
        return (brng + 360) % 360;
      }
    }
    return 0;
  }, [latitude, longitude, history]);

  // Helper to construct custom stylized route-labeled brutalist markers
  const createBusIcon = (routeNumber: string, labelBusName: string, isSelected: boolean, isRunning: boolean, headingDegrees: number) => {
    return L.divIcon({
      className: 'custom-bus-icon-container',
      html: `
        <div class="flex flex-col items-center" style="margin-top: -45px;">
          <!-- Custom Branded Non-rotating Text Label with Bus Name -->
          <div class="bg-[#141414] text-white px-2 py-1 text-[10px] font-black uppercase tracking-wider mb-1.5 whitespace-nowrap border-2 border-white shadow-lg flex items-center gap-1.5 rounded-none">
            <span class="bg-[#4fc3f7] text-[#141414] px-1 font-mono">${routeNumber}</span>
            <span>${labelBusName || 'Bus'}</span>
          </div>
          
          <!-- Rotating custom branded bus icon container -->
          <div style="transform: rotate(${Math.round(headingDegrees)}deg); transform-origin: center; transition: transform 0.8s cubic-bezier(0.25, 1, 0.5, 1);" class="relative flex items-center justify-center">
            <!-- Live ping pulse -->
            ${isRunning ? '<div class="absolute h-10 w-10 rounded-full border-2 border-[#4fc3f7] animate-ping opacity-25"></div>' : ''}
            
            <!-- Premium Branded SVG Map Marker -->
            <svg width="40" height="40" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- Heading direction pointer triangle (always pointing upwards/North in the base SVG, so rotation aligns it perfectly) -->
              <path d="M22 1L27 9H17L22 1Z" fill="#0284c7" />
              
              <!-- Outer circular ring -->
              <circle cx="22" cy="24" r="16" fill="#4fc3f7" stroke="#0284c7" stroke-width="2" />
              
              <!-- Inner white circle -->
              <circle cx="22" cy="24" r="11" fill="white" />
              
              <!-- Front-facing bus logo inside white circle -->
              <!-- Bus body -->
              <rect x="16" y="18" width="12" height="12" rx="2" fill="#29b6f6" />
              <!-- Windshield -->
              <rect x="17.5" y="19.5" width="9" height="4" rx="1" fill="#e0f7fa" />
              <!-- Grille lines -->
              <rect x="19.5" y="26" width="5" height="1" fill="#cfd8dc" />
              <!-- Headlights -->
              <circle cx="18.5" cy="25" r="1" fill="#fff59d" />
              <circle cx="25.5" cy="25" r="1" fill="#fff59d" />
              <!-- Wheels/Bumper -->
              <rect x="17" y="29" width="2" height="2" fill="#90a4ae" />
              <rect x="25" y="29" width="2" height="2" fill="#90a4ae" />
            </svg>
          </div>
        </div>
      `,
      iconSize: [140, 80],
      iconAnchor: [70, 65],
    });
  };

  return (
    <div className="relative w-full h-full border border-[#D1D1CE] shadow-sm min-h-[350px] bg-[#F9F9F8]">
      
      {/* Custom Map Layer Selector Panel */}
      <div className="absolute top-[72px] right-4 z-[1001] flex flex-col items-end">
        <button
          type="button"
          onClick={() => setLayersOpen(!layersOpen)}
          className="bg-white border border-[#D1D1CE] hover:border-[#141414] text-[#141414] p-2.5 shadow-md flex items-center justify-center transition-colors cursor-pointer rounded-none"
          title="Map Layers"
        >
          <Layers className="h-4 w-4" />
        </button>

        {layersOpen && (
          <div className="mt-2 bg-white border-2 border-[#141414] p-4 w-52 shadow-xl rounded-none text-left font-sans">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[#141414] mb-3 pb-1.5 border-b border-[#F2F2F2] flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              <span>Map Layers</span>
            </h4>

            {/* Base maps selection */}
            <div className="space-y-1.5 mb-4">
              <span className="block text-[9px] font-mono font-black uppercase tracking-wider text-[#8E9299] mb-1">Base View</span>
              
              <button
                type="button"
                onClick={() => setActiveBase('street')}
                className={`w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider px-2.5 py-2 transition-colors rounded-none border ${
                  activeBase === 'street'
                    ? 'bg-[#141414] border-[#141414] text-white'
                    : 'bg-[#F9F9F8] border-[#D1D1CE] text-[#141414] hover:bg-[#F2F2F2]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MapIcon className="h-3.5 w-3.5" />
                  <span>Street View</span>
                </div>
                {activeBase === 'street' && <Check className="h-3.5 w-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveBase('satellite')}
                className={`w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider px-2.5 py-2 transition-colors rounded-none border ${
                  activeBase === 'satellite'
                    ? 'bg-[#141414] border-[#141414] text-white'
                    : 'bg-[#F9F9F8] border-[#D1D1CE] text-[#141414] hover:bg-[#F2F2F2]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" />
                  <span>Satellite</span>
                </div>
                {activeBase === 'satellite' && <Check className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Overlays selection */}
            <div>
              <span className="block text-[9px] font-mono font-black uppercase tracking-wider text-[#8E9299] mb-1.5">Overlays</span>
              
              <label className="flex items-center gap-2 px-2 py-1.5 border border-[#D1D1CE] bg-[#F9F9F8] cursor-pointer hover:bg-[#F2F2F2] transition-colors select-none">
                <input
                  type="checkbox"
                  checked={showOverlay}
                  onChange={(e) => setShowOverlay(e.target.checked)}
                  className="rounded-none border-[#D1D1CE] text-[#141414] focus:ring-0 cursor-pointer h-3.5 w-3.5 accent-[#141414]"
                />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#141414]">Traffic Overlay</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Dynamic elegant status banner: route selected but offline */}
      {selectedBusId && !hasSelectedActive && (
        <div className="absolute top-4 left-4 right-4 z-[1000] bg-white border border-[#D1D1CE] p-3 shadow-md flex items-center justify-between font-sans">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 bg-[#8E9299] flex-shrink-0"></span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#141414]">
              Route {busNumber}: Standby (Awaiting live driver telemetry)
            </span>
          </div>
          <span className="text-[9px] font-mono font-bold uppercase text-[#8E9299]">Standby Feed</span>
        </div>
      )}

      {/* Overview status banner: no selected route */}
      {!selectedBusId && (
        <div className="absolute top-4 left-4 right-4 z-[1000] bg-[#141414] text-white p-3 shadow-md flex items-center justify-between font-sans">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 bg-blue-500 flex-shrink-0 animate-pulse"></span>
            <span className="text-[10px] font-black uppercase tracking-widest">
              Awaiting Route Selection
            </span>
          </div>
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider opacity-80">Select Route Sidebar to Track</span>
        </div>
      )}

      <MapContainer
        center={centerPosition}
        zoom={14}
        className="w-full h-full min-h-[350px]"
        scrollWheelZoom={true}
      >
        {activeBase === 'street' ? (
          <TileLayer
            key="street-layer"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />
        ) : (
          <TileLayer
            key="satellite-layer"
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}

        {showOverlay && (
          <TileLayer
            key="traffic-overlay"
            attribution='Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
            url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
            maxZoom={19}
            opacity={0.85}
          />
        )}

        <MapViewUpdater
          center={centerPosition}
          zoom={15}
          points={polylinePoints.length > 0 ? polylinePoints : undefined}
          selectedBusId={selectedBusId}
        />

        {/* Render the selected bus (styled distinctively, regardless of running or offline) */}
        {selectedBusId && isValidCoordinate(latitude, longitude) && (
          <AnimatedMarker
            position={[latitude!, longitude!]}
            icon={createBusIcon(busNumber || 'BUS', busName || 'Bus', true, hasSelectedActive, heading)}
          >
            <Popup closeButton={false}>
              <div className="text-[#141414] font-sans p-1.5 leading-normal">
                <p className="font-bold text-[9px] uppercase tracking-widest text-[#8E9299] font-mono">
                  {hasSelectedActive ? 'Active Tracker' : 'Last Known Location'}
                </p>
                <p className="font-black text-sm text-[#141414] uppercase tracking-tight mt-0.5">{busNumber}</p>
                <p className="text-xs text-[#141414] font-bold mt-0.5">{busName || 'Express Service'}</p>
                <p className="text-[9px] text-[#8E9299] font-mono mt-1 pt-1 border-t border-[#F2F2F2] font-semibold">
                  COORDS: {latitude!.toFixed(6)}, {longitude!.toFixed(6)}
                </p>
              </div>
            </Popup>
          </AnimatedMarker>
        )}

        {/* Render route history polyline tracer */}
        {polylinePoints.length > 0 && (
          <Polyline
            positions={polylinePoints}
            pathOptions={{
              color: '#141414',
              weight: 3.5,
              opacity: 0.85,
              dashArray: '6, 8',
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
