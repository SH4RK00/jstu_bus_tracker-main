import crypto from 'crypto';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { parse } from 'cookie';

dotenv.config();

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const sendError = (res, status, error) => sendJson(res, status, { error });

const verifySessionToken = (token) => {
  try {
    const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-super-secret-bustracker-2026-auth';
    const key = crypto.scryptSync(SESSION_SECRET, 'salt', 32);
    const iv = Buffer.alloc(16, 0);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(token, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (err) {
    return null;
  }
};

const createPool = () => {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.SQL_URL;
  const host = process.env.SQL_HOST || process.env.PGHOST || process.env.POSTGRES_HOST;
  const user = process.env.SQL_USER || process.env.PGUSER || process.env.POSTGRES_USER;
  const password = process.env.SQL_PASSWORD || process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const database = process.env.SQL_DB_NAME || process.env.PGDATABASE || process.env.POSTGRES_DB;
  const isNeon = (connectionString || host || '').includes('neon.tech');

  const poolConfig = {
    connectionTimeoutMillis: 15000,
    ssl: isNeon ? { rejectUnauthorized: false } : undefined,
  };

  const pool = connectionString
    ? new Pool({ connectionString, ...poolConfig })
    : new Pool({ host, user, password, database, ...poolConfig });

  pool.on('connect', (client) => {
    client.query('SET search_path TO public, "$user"').catch((err) => {
      console.error('Failed to set search_path on new connection:', err);
    });
  });

  return pool;
};

let pool;
let schemaReady = false;

const getPool = () => {
  if (!pool) {
    pool = createPool();
    pool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return pool;
};

const ensureDatabaseSchema = async () => {
  if (schemaReady) return;
  const dbPool = getPool();

  await dbPool.query('CREATE SCHEMA IF NOT EXISTS public');

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS public.users (
      id serial PRIMARY KEY,
      uid text UNIQUE,
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      password text DEFAULT '',
      role text NOT NULL DEFAULT 'user',
      created_at timestamp DEFAULT now()
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS public.buses (
      id serial PRIMARY KEY,
      bus_number text NOT NULL UNIQUE,
      name text NOT NULL,
      is_running boolean NOT NULL DEFAULT false,
      last_latitude double precision,
      last_longitude double precision,
      last_updated timestamp,
      odometer double precision DEFAULT 125430.5,
      engine_hours double precision DEFAULT 3452.1,
      sos_active boolean DEFAULT false,
      sos_message text DEFAULT '',
      created_at timestamp DEFAULT now()
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS public.schedules (
      id serial PRIMARY KEY,
      bus_id integer NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
      route_from text NOT NULL,
      route_to text NOT NULL,
      departure_time text NOT NULL,
      arrival_time text NOT NULL,
      created_at timestamp DEFAULT now()
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS public.assignments (
      id serial PRIMARY KEY,
      bus_id integer NOT NULL UNIQUE REFERENCES public.buses(id) ON DELETE CASCADE,
      driver_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      assigned_at timestamp DEFAULT now()
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS public.location_logs (
      id serial PRIMARY KEY,
      bus_id integer NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
      driver_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      latitude double precision NOT NULL,
      longitude double precision NOT NULL,
      "timestamp" timestamp NOT NULL DEFAULT now()
    );
  `);

  schemaReady = true;
};

const getRequestBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
};

const getSessionUser = (req) => {
  const cookies = req.headers?.cookie ? parse(req.headers.cookie) : {};
  const sessionToken = cookies.__session;
  if (!sessionToken) return null;
  return verifySessionToken(sessionToken);
};

const requireAdmin = (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.role !== 'admin') {
    sendError(res, 401, 'Unauthorized: Admin session required');
    return null;
  }
  return user;
};

const requireAnyUser = (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    sendError(res, 401, 'Unauthorized: Session required');
    return null;
  }
  return user;
};

const normalizeEmail = (value) => String(value || '').toLowerCase().trim();

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const checkHash = crypto.pbkdf2Sync(String(password), salt, 1000, 64, 'sha512').toString('hex');
  return hash === checkHash;
};

const handleAdminDashboard = async (req, res) => {
  await ensureDatabaseSchema();
  const dbPool = getPool();
  try {
    const busesResult = await dbPool.query('SELECT * FROM public.buses ORDER BY id');
    const driversResult = await dbPool.query("SELECT * FROM public.users WHERE role = 'driver' ORDER BY id");
    const assignmentsResult = await dbPool.query(`
      SELECT a.id AS assignment_id, b.id AS bus_id, b.bus_number AS bus_number, b.name AS bus_name,
             b.is_running AS is_running, b.last_latitude AS last_latitude, b.last_longitude AS last_longitude,
             b.last_updated AS last_updated, b.odometer AS odometer, b.engine_hours AS engine_hours,
             b.sos_active AS sos_active, b.sos_message AS sos_message,
             u.id AS driver_id, u.name AS driver_name, u.email AS driver_email
      FROM public.assignments a
      INNER JOIN public.buses b ON a.bus_id = b.id
      INNER JOIN public.users u ON a.driver_id = u.id
      ORDER BY a.id
    `);

    sendJson(res, 200, {
      totalBuses: busesResult.rows.length,
      totalDrivers: driversResult.rows.length,
      runningBuses: busesResult.rows.filter((bus) => bus.is_running).length,
      assignments: assignmentsResult.rows.map((row) => ({
        assignmentId: row.assignment_id,
        busId: row.bus_id,
        busNumber: row.bus_number,
        busName: row.bus_name,
        isRunning: row.is_running,
        lastLatitude: row.last_latitude,
        lastLongitude: row.last_longitude,
        lastUpdated: row.last_updated,
        odometer: row.odometer,
        engineHours: row.engine_hours,
        sosActive: row.sos_active,
        sosMessage: row.sos_message,
        driverId: row.driver_id,
        driverName: row.driver_name,
        driverEmail: row.driver_email,
      })),
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    sendError(res, 500, 'Failed to fetch dashboard');
  }
};

const handleAdminUsers = async (req, res) => {
  await ensureDatabaseSchema();
  const dbPool = getPool();
  try {
    if (req.method === 'GET') {
      // Return a safe hasPassword flag instead of raw password hash
      const result = await dbPool.query(`SELECT id, uid, email, name, role, created_at,
        CASE WHEN password IS NULL OR password = '' THEN false ELSE true END AS "hasPassword"
        FROM public.users ORDER BY id`);
      sendJson(res, 200, result.rows);
      return;
    }

    if (req.method === 'POST') {
      const body = await getRequestBody(req);
      const { email, name, role, password } = body;
      if (!email || !name || !role || !password) {
        sendError(res, 400, 'Missing required fields');
        return;
      }

      const normalizedEmail = normalizeEmail(email);
      const existing = await dbPool.query('SELECT id FROM public.users WHERE email = $1', [normalizedEmail]);
      if (existing.rows.length > 0) {
        sendError(res, 400, 'User with this email already exists');
        return;
      }

      const hashedPassword = hashPassword(password);
      const created = await dbPool.query(
        `INSERT INTO public.users (email, name, role, password, uid)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, uid, email, name, role, created_at`,
        [normalizedEmail, name, role, hashedPassword, `local_${Date.now()}`],
      );
      sendJson(res, 200, created.rows[0]);
    }
  } catch (err) {
    console.error('Admin users error:', err);
    sendError(res, 500, 'Failed to load users');
  }
};

const handleAdminBuses = async (req, res) => {
  await ensureDatabaseSchema();
  const dbPool = getPool();
  try {
    if (req.method === 'GET') {
      const result = await dbPool.query('SELECT id, bus_number AS "busNumber", name, is_running AS "isRunning", last_latitude AS "lastLatitude", last_longitude AS "lastLongitude", last_updated AS "lastUpdated", odometer, engine_hours AS "engineHours", sos_active AS "sosActive", sos_message AS "sosMessage" FROM public.buses ORDER BY id');
      sendJson(res, 200, result.rows);
      return;
    }

    if (req.method === 'POST') {
      const body = await getRequestBody(req);
      const { busNumber, name, schedules: scheduleList = [] } = body;
      if (!busNumber || !name) {
        sendError(res, 400, 'Missing busNumber or name');
        return;
      }

      const existing = await dbPool.query('SELECT id FROM public.buses WHERE bus_number = $1', [String(busNumber).toUpperCase().trim()]);
      if (existing.rows.length > 0) {
        sendError(res, 400, 'Bus number already exists');
        return;
      }

      const created = await dbPool.query(
        'INSERT INTO public.buses (bus_number, name) VALUES ($1, $2) RETURNING id, bus_number AS "busNumber", name',
        [String(busNumber).toUpperCase().trim(), String(name)],
      );

      const bus = created.rows[0];
      if (Array.isArray(scheduleList) && scheduleList.length > 0) {
        const inserts = scheduleList.filter((s) => s.routeFrom && s.routeTo && s.departureTime && s.arrivalTime)
          .map((s) => dbPool.query('INSERT INTO public.schedules (bus_id, route_from, route_to, departure_time, arrival_time) VALUES ($1, $2, $3, $4, $5)', [bus.id, s.routeFrom, s.routeTo, s.departureTime, s.arrivalTime]));
        await Promise.all(inserts);
      }

      sendJson(res, 200, bus);
    }
  } catch (err) {
    console.error('Admin buses error:', err);
    sendError(res, 500, 'Failed to create or load buses');
  }
};

const handleAdminAssignments = async (req, res) => {
  await ensureDatabaseSchema();
  const dbPool = getPool();
  try {
    const body = await getRequestBody(req);
    const { busId, driverId } = body;
    if (!busId || !driverId) {
      sendError(res, 400, 'Missing busId or driverId');
      return;
    }

    const driverResult = await dbPool.query('SELECT id FROM public.users WHERE id = $1 AND role = $2', [Number(driverId), 'driver']);
    if (driverResult.rows.length === 0) {
      sendError(res, 400, 'Selected user is not a valid driver');
      return;
    }

    const existing = await dbPool.query('SELECT id FROM public.assignments WHERE bus_id = $1', [Number(busId)]);
    let result;
    if (existing.rows.length > 0) {
      result = await dbPool.query('UPDATE public.assignments SET driver_id = $1 WHERE bus_id = $2 RETURNING id, bus_id AS "busId", driver_id AS "driverId"', [Number(driverId), Number(busId)]);
    } else {
      result = await dbPool.query('INSERT INTO public.assignments (bus_id, driver_id) VALUES ($1, $2) RETURNING id, bus_id AS "busId", driver_id AS "driverId"', [Number(busId), Number(driverId)]);
    }

    sendJson(res, 200, result.rows[0]);
  } catch (err) {
    console.error('Assignments error:', err);
    sendError(res, 500, 'Failed to assign driver');
  }
};

const handleUnassignDriver = async (req, res, busId) => {
  await ensureDatabaseSchema();
  const dbPool = getPool();
  try {
    const result = await dbPool.query('DELETE FROM public.assignments WHERE bus_id = $1 RETURNING id', [Number(busId)]);
    if (result.rowCount === 0) {
      sendJson(res, 404, { error: 'No assignment found for this bus' });
      return;
    }
    sendJson(res, 200, { success: true, message: 'Driver unassigned successfully' });
  } catch (err) {
    console.error('Unassign driver error:', err);
    sendError(res, 500, 'Failed to unassign driver');
  }
};

const handleDeleteBus = async (req, res, busId) => {
  await ensureDatabaseSchema();
  const dbPool = getPool();
  try {
    await dbPool.query('BEGIN');
    await dbPool.query('DELETE FROM public.location_logs WHERE bus_id = $1', [Number(busId)]);
    await dbPool.query('DELETE FROM public.assignments WHERE bus_id = $1', [Number(busId)]);
    await dbPool.query('DELETE FROM public.schedules WHERE bus_id = $1', [Number(busId)]);
    const deleted = await dbPool.query('DELETE FROM public.buses WHERE id = $1 RETURNING id', [Number(busId)]);
    if (deleted.rowCount === 0) {
      await dbPool.query('ROLLBACK');
      sendJson(res, 404, { error: 'Bus not found' });
      return;
    }
    await dbPool.query('COMMIT');
    sendJson(res, 200, { success: true, message: 'Bus and all related data deleted successfully' });
  } catch (err) {
    await dbPool.query('ROLLBACK').catch(() => {});
    console.error('Delete bus error:', err);
    sendError(res, 500, 'Failed to delete bus');
  }
};

const handleBusLogs = async (req, res, busId) => {
  await ensureDatabaseSchema();
  const dbPool = getPool();
  try {
    const result = await dbPool.query(`
      SELECT l.id, l.latitude, l.longitude, l.timestamp, l.driver_id AS "driverId", u.name AS "driverName", u.email AS "driverEmail"
      FROM public.location_logs l
      INNER JOIN public.users u ON l.driver_id = u.id
      WHERE l.bus_id = $1
      ORDER BY l.timestamp DESC
      LIMIT 200
    `, [Number(busId)]);
    sendJson(res, 200, result.rows);
  } catch (err) {
    console.error('Bus logs error:', err);
    sendError(res, 500, 'Failed to fetch historical logs');
  }
};

const handleBusSchedules = async (req, res, busId) => {
  await ensureDatabaseSchema();
  const dbPool = getPool();
  try {
    if (req.method === 'POST') {
      const body = await getRequestBody(req);
      const { routeFrom, routeTo, departureTime, arrivalTime } = body;
      if (!routeFrom || !routeTo || !departureTime || !arrivalTime) {
        sendError(res, 400, 'Missing required fields');
        return;
      }
      const result = await dbPool.query(
        'INSERT INTO public.schedules (bus_id, route_from, route_to, departure_time, arrival_time) VALUES ($1, $2, $3, $4, $5) RETURNING id, bus_id AS "busId", route_from AS "routeFrom", route_to AS "routeTo", departure_time AS "departureTime", arrival_time AS "arrivalTime"',
        [Number(busId), routeFrom, routeTo, departureTime, arrivalTime],
      );
      sendJson(res, 200, result.rows[0]);
    }
  } catch (err) {
    console.error('Bus schedules error:', err);
    sendError(res, 500, 'Failed to add schedule');
  }
};

const handleScheduleUpdate = async (req, res, scheduleId) => {
  await ensureDatabaseSchema();
  const dbPool = getPool();
  try {
    const body = await getRequestBody(req);
    const { routeFrom, routeTo, departureTime, arrivalTime } = body;
    if (!routeFrom || !routeTo || !departureTime || !arrivalTime) {
      sendError(res, 400, 'Missing required fields');
      return;
    }
    const result = await dbPool.query(
      'UPDATE public.schedules SET route_from = $1, route_to = $2, departure_time = $3, arrival_time = $4 WHERE id = $5 RETURNING id, bus_id AS "busId", route_from AS "routeFrom", route_to AS "routeTo", departure_time AS "departureTime", arrival_time AS "arrivalTime"',
      [routeFrom, routeTo, departureTime, arrivalTime, Number(scheduleId)],
    );
    sendJson(res, 200, result.rows[0]);
  } catch (err) {
    console.error('Schedule update error:', err);
    sendError(res, 500, 'Failed to update schedule');
  }
};

const handleScheduleDelete = async (req, res, scheduleId) => {
  await ensureDatabaseSchema();
  const dbPool = getPool();
  try {
    await dbPool.query('DELETE FROM public.schedules WHERE id = $1', [Number(scheduleId)]);
    sendJson(res, 200, { success: true });
  } catch (err) {
    console.error('Schedule delete error:', err);
    sendError(res, 500, 'Failed to delete schedule');
  }
};

const handleBusesList = async (req, res) => {
  await ensureDatabaseSchema();
  const dbPool = getPool();
  try {
    const busesResult = await dbPool.query('SELECT * FROM public.buses ORDER BY id');
    const output = [];
    for (const bus of busesResult.rows) {
      const schedulesResult = await dbPool.query('SELECT id, route_from AS "routeFrom", route_to AS "routeTo", departure_time AS "departureTime", arrival_time AS "arrivalTime" FROM public.schedules WHERE bus_id = $1 ORDER BY id', [bus.id]);
      const assignmentResult = await dbPool.query('SELECT u.name FROM public.assignments a INNER JOIN public.users u ON a.driver_id = u.id WHERE a.bus_id = $1 LIMIT 1', [bus.id]);
      output.push({
        id: bus.id,
        busNumber: bus.bus_number,
        name: bus.name,
        isRunning: bus.is_running,
        lastLatitude: bus.last_latitude,
        lastLongitude: bus.last_longitude,
        lastUpdated: bus.last_updated,
        odometer: bus.odometer,
        engineHours: bus.engine_hours,
        sosActive: bus.sos_active,
        sosMessage: bus.sos_message,
        schedules: schedulesResult.rows,
        driverName: assignmentResult.rows[0]?.name || 'No driver assigned',
      });
    }
    sendJson(res, 200, output);
  } catch (err) {
    console.error('Buses list error:', err);
    sendError(res, 500, 'Failed to fetch buses list');
  }
};

const handleBusHistory = async (req, res, busId) => {
  await ensureDatabaseSchema();
  const dbPool = getPool();
  try {
    const result = await dbPool.query('SELECT id, latitude, longitude, timestamp, driver_id AS "driverId" FROM public.location_logs WHERE bus_id = $1 ORDER BY timestamp DESC LIMIT 30', [Number(busId)]);
    sendJson(res, 200, result.rows);
  } catch (err) {
    console.error('Bus history error:', err);
    sendError(res, 500, 'Failed to load trace logs');
  }
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const url = new URL(req.url || '/', 'https://example.com');
    // Log incoming requests for debugging on Vercel (method + pathname)
    try {
      const pathnameLog = url.pathname;
      console.log('[serverless] Request:', req.method, pathnameLog);
    } catch (logErr) {
      console.log('[serverless] Request received, failed to compute pathname');
    }
    const pathname = url.pathname;
    if (!pathname.startsWith('/api/')) {
      sendError(res, 404, 'Not found');
      return;
    }

    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'api') {
      sendError(res, 404, 'Not found');
      return;
    }

  if (parts[1] === 'admin') {
    if (parts[2] === 'dashboard') {
      if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');
      const user = requireAdmin(req, res);
      if (!user) return;
      return handleAdminDashboard(req, res);
    }

    if (parts[2] === 'users') {
      const user = requireAdmin(req, res);
      if (!user) return;
      return handleAdminUsers(req, res);
    }

    if (parts[2] === 'buses') {
      const user = requireAdmin(req, res);
      if (!user) return;
      if (parts[3] && parts[3] !== 'logs') {
        const busId = parts[3];
        if (req.method === 'DELETE') return handleDeleteBus(req, res, busId);
        if (parts[4] === 'schedules') return handleBusSchedules(req, res, busId);
        if (parts[4] === 'logs') return handleBusLogs(req, res, busId);
      }
      if (req.method === 'GET') return handleAdminBuses(req, res);
      if (req.method === 'POST') return handleAdminBuses(req, res);
      return sendError(res, 405, 'Method not allowed');
    }

    if (parts[2] === 'assignments') {
      const user = requireAdmin(req, res);
      if (!user) return;
      if (req.method === 'POST') return handleAdminAssignments(req, res);
      if (req.method === 'DELETE' && parts[3]) return handleUnassignDriver(req, res, parts[3]);
      return sendError(res, 405, 'Method not allowed');
    }

    if (parts[2] === 'schedules' && parts[3]) {
      const user = requireAdmin(req, res);
      if (!user) return;
      if (req.method === 'PUT') return handleScheduleUpdate(req, res, parts[3]);
      if (req.method === 'DELETE') return handleScheduleDelete(req, res, parts[3]);
      return sendError(res, 405, 'Method not allowed');
    }

    return sendError(res, 404, 'Admin route not found');
  }

  if (parts[1] === 'buses') {
    const user = requireAnyUser(req, res);
    if (!user) return;
    if (parts[2]) {
      if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');
      return handleBusHistory(req, res, parts[2]);
    }
    if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed');
    return handleBusesList(req, res);
  }

  if (parts[1] === 'driver') {
    const user = requireAnyUser(req, res);
    if (!user) return;

    // GET /api/driver/assigned-bus
    if (parts[2] === 'assigned-bus' && req.method === 'GET') {
      try {
        await ensureDatabaseSchema();
        const dbPool = getPool();
        const assignmentsResult = await dbPool.query(`
          SELECT b.id AS id, b.id AS busId, b.bus_number AS "busNumber", b.name AS name, b.is_running AS "isRunning",
                 b.last_latitude AS "lastLatitude", b.last_longitude AS "lastLongitude", b.last_updated AS "lastUpdated",
                 b.odometer AS odometer, b.engine_hours AS "engineHours", b.sos_active AS "sosActive", b.sos_message AS "sosMessage"
          FROM public.assignments a
          INNER JOIN public.buses b ON a.bus_id = b.id
          WHERE a.driver_id = $1`, [Number(user.id)]);

        if (assignmentsResult.rows.length === 0) {
          sendJson(res, 200, { assigned: false, buses: [] });
          return;
        }

        const busesWithSchedules = [];
        for (const b of assignmentsResult.rows) {
          const schedulesResult = await dbPool.query('SELECT id, route_from AS "routeFrom", route_to AS "routeTo", departure_time AS "departureTime", arrival_time AS "arrivalTime" FROM public.schedules WHERE bus_id = $1 ORDER BY id', [b.busid || b.busId || b.id]);
          busesWithSchedules.push({
            ...b,
            schedules: schedulesResult.rows,
          });
        }

        sendJson(res, 200, {
          assigned: true,
          bus: busesWithSchedules[0],
          schedules: busesWithSchedules[0].schedules,
          buses: busesWithSchedules,
        });
      } catch (err) {
        console.error('Driver assigned-bus error:', err);
        sendError(res, 500, 'Failed to fetch driver schedules');
      }
      return;
    }

    // POST /api/driver/toggle-driving
    if (parts[2] === 'toggle-driving' && req.method === 'POST') {
      try {
        await ensureDatabaseSchema();
        const dbPool = getPool();
        const body = await getRequestBody(req);
        const { busId, isRunning, latitude, longitude } = body;
        if (!busId) return sendError(res, 400, 'Missing busId');

        const ass = await dbPool.query('SELECT id FROM public.assignments WHERE bus_id = $1 AND driver_id = $2 LIMIT 1', [Number(busId), Number(user.id)]);
        if (ass.rows.length === 0) return sendError(res, 403, 'Forbidden: Driver not assigned to this bus');

        const now = new Date();
        await dbPool.query('UPDATE public.buses SET is_running = $1, last_latitude = $2, last_longitude = $3, last_updated = $4 WHERE id = $5', [!!isRunning, isRunning ? latitude : null, isRunning ? longitude : null, isRunning ? now : null, Number(busId)]);

        if (isRunning && latitude !== undefined && longitude !== undefined) {
          await dbPool.query('INSERT INTO public.location_logs (bus_id, driver_id, latitude, longitude) VALUES ($1, $2, $3, $4)', [Number(busId), Number(user.id), Number(latitude), Number(longitude)]);
        }

        sendJson(res, 200, { success: true, isRunning: !!isRunning });
      } catch (err) {
        console.error('Driver toggle-driving error:', err);
        sendError(res, 500, 'Failed to start/stop driving');
      }
      return;
    }

    // POST /api/driver/toggle-sos
    if (parts[2] === 'toggle-sos' && req.method === 'POST') {
      try {
        await ensureDatabaseSchema();
        const dbPool = getPool();
        const body = await getRequestBody(req);
        const { busId, sosActive, sosMessage } = body;
        if (!busId) return sendError(res, 400, 'Missing busId');

        const ass = await dbPool.query('SELECT id FROM public.assignments WHERE bus_id = $1 AND driver_id = $2 LIMIT 1', [Number(busId), Number(user.id)]);
        if (ass.rows.length === 0) return sendError(res, 403, 'Forbidden: Driver not assigned to this bus');

        await dbPool.query('UPDATE public.buses SET sos_active = $1, sos_message = $2 WHERE id = $3', [!!sosActive, sosActive ? (sosMessage || 'EMERGENCY SOS: Driver reported urgent assistance required!') : '', Number(busId)]);

        sendJson(res, 200, { success: true, sosActive: !!sosActive, sosMessage: sosActive ? (sosMessage || 'EMERGENCY SOS: Driver reported urgent assistance required!') : '' });
      } catch (err) {
        console.error('Driver toggle-sos error:', err);
        sendError(res, 500, 'Failed to toggle Emergency SOS');
      }
      return;
    }

    // POST /api/driver/location
    if (parts[2] === 'location' && req.method === 'POST') {
      try {
        await ensureDatabaseSchema();
        const dbPool = getPool();
        const body = await getRequestBody(req);
        const { busId, latitude, longitude } = body;
        if (!busId || latitude === undefined || longitude === undefined) return sendError(res, 400, 'Missing required location params');

        const ass = await dbPool.query('SELECT id FROM public.assignments WHERE bus_id = $1 AND driver_id = $2 LIMIT 1', [Number(busId), Number(user.id)]);
        if (ass.rows.length === 0) return sendError(res, 403, 'Forbidden');

        await dbPool.query('UPDATE public.buses SET last_latitude = $1, last_longitude = $2, last_updated = $3 WHERE id = $4', [Number(latitude), Number(longitude), new Date(), Number(busId)]);
        await dbPool.query('INSERT INTO public.location_logs (bus_id, driver_id, latitude, longitude) VALUES ($1, $2, $3, $4)', [Number(busId), Number(user.id), Number(latitude), Number(longitude)]);

        sendJson(res, 200, { success: true });
      } catch (err) {
        console.error('Driver location error:', err);
        sendError(res, 500, 'Failed to update coordinates');
      }
      return;
    }

    return sendError(res, 404, 'Driver route not found');
  }

  sendError(res, 404, 'Route not found');
  } catch (err) {
    console.error('Unhandled serverless handler error:', err);
    sendError(res, 500, 'Server error: unexpected condition while processing request');
  }
}
