export interface User {
  id: number;
  uid: string | null;
  email: string;
  name: string;
  password?: string;
  role: 'admin' | 'driver' | 'user';
  createdAt: string;
}

export interface Bus {
  id: number;
  busNumber: string;
  name: string;
  isRunning: boolean;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastUpdated: string | null;
  odometer?: number | null;
  engineHours?: number | null;
  sosActive?: boolean;
  sosMessage?: string | null;
  createdAt: string;
  schedules?: Schedule[];
  driverName?: string;
}

export interface Schedule {
  id: number;
  busId: number;
  routeFrom: string;
  routeTo: string;
  departureTime: string;
  arrivalTime: string;
  createdAt: string;
}

export interface Assignment {
  assignmentId: number;
  busId: number;
  busNumber: string;
  busName: string;
  isRunning: boolean;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastUpdated: string | null;
  odometer?: number | null;
  engineHours?: number | null;
  sosActive?: boolean;
  sosMessage?: string | null;
  driverId: number;
  driverName: string;
  driverEmail: string;
}

export interface LocationLog {
  id: number;
  busId: number;
  driverId: number;
  latitude: number;
  longitude: number;
  timestamp: string;
}
