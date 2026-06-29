import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { eq, and, desc } from 'drizzle-orm';

// Load environment variables
dotenv.config();

import { db, ensureDatabaseSchema } from './src/db/index.ts';
import { users, buses, schedules, assignments, locationLogs } from './src/db/schema.ts';
import { hashPassword, verifyPassword } from './src/lib/password.ts';
import { createSessionToken } from './src/lib/session.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middlewares
  app.use(express.json());
  app.use(cookieParser());

  // Ensure database tables exist before handling requests
  await ensureDatabaseSchema();

  // API - Session Login (Local Credentials)
  app.post('/api/session-login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      const normalizedEmail = email.toLowerCase().trim();
      let dbUser = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

      if (dbUser.length === 0) {
        // Automatically seed admin if no admin exists
        const totalUsers = await db.select().from(users).limit(1);
        if (totalUsers.length === 0 && normalizedEmail === 'admin@bustracker.dev') {
          const hashedPassword = hashPassword(password);
          const inserted = await db.insert(users).values({
            email: normalizedEmail,
            name: 'Fleet Administrator',
            password: hashedPassword,
            role: 'admin',
            uid: 'admin_local',
          }).returning();
          dbUser = inserted;
        } else {
          return res.status(401).json({ error: 'Invalid email or password' });
        }
      } else {
        let userRecord = dbUser[0];
        
        // Dynamically initialize the default password 'admin123' for pre-seeded admin@bustracker.dev if no password is set
        if (normalizedEmail === 'admin@bustracker.dev' && (!userRecord.password || userRecord.password === '')) {
          const defaultAdminPass = 'admin123';
          const hashedPassword = hashPassword(defaultAdminPass);
          const updated = await db.update(users)
            .set({ password: hashedPassword })
            .where(eq(users.id, userRecord.id))
            .returning();
          userRecord = updated[0];
        }

        const isValid = verifyPassword(password, userRecord.password || '');
        if (!isValid) {
          return res.status(401).json({ error: 'Invalid email or password' });
        }
        dbUser = [userRecord];
      }

      const verifiedUser = dbUser[0];
      const expiresIn = 14 * 24 * 60 * 60 * 1000; // 14 days
      const sessionToken = createSessionToken({
        id: verifiedUser.id,
        email: verifiedUser.email,
        name: verifiedUser.name,
        role: verifiedUser.role,
      });

      res.cookie('__session', sessionToken, {
        maxAge: expiresIn,
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      });

      res.json({ status: 'success' });
    } catch (error) {
      console.error('Session login error:', error);
      res.status(500).json({ error: 'Internal server error during login' });
    }
  });

  // API - Developer Bypass Login
  app.post('/api/bypass-login', async (req, res) => {
    const { email, role, name } = req.body;
    if (!email || !role || !name) {
      return res.status(400).json({ error: 'Email, role, and name are required' });
    }

    try {
      const claims = {
        uid: `bypass_${role}_${email.replace(/[@.]/g, '_')}`,
        email: email.toLowerCase().trim(),
        name,
        role,
      };

      const sessionCookie = Buffer.from(JSON.stringify(claims)).toString('base64');
      const expiresIn = 14 * 24 * 60 * 60 * 1000;

      res.cookie('__session_bypass', sessionCookie, {
        maxAge: expiresIn,
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      });

      // Synchronize / Check User in DB
      let dbUser = await db.select().from(users).where(eq(users.uid, claims.uid)).limit(1);
      if (dbUser.length === 0) {
        const existingByEmail = await db.select().from(users).where(eq(users.email, claims.email)).limit(1);
        if (existingByEmail.length > 0) {
          await db.update(users)
            .set({ uid: claims.uid, name: claims.name })
            .where(eq(users.id, existingByEmail[0].id));
        } else {
          const totalUsers = await db.select().from(users).limit(1);
          const finalRole = totalUsers.length === 0 ? 'admin' : role;
          await db.insert(users).values({
            uid: claims.uid,
            email: claims.email,
            name: claims.name,
            role: finalRole,
          });
        }
      }

      res.json({ status: 'success' });
    } catch (err) {
      console.error('Bypass login error:', err);
      res.status(500).json({ error: 'Failed to establish developer bypass session' });
    }
  });

  // API - List pre-seeded / registered users to facilitate easy quick-testing selection
  app.get('/api/bypass-users', async (req, res) => {
    try {
      const list = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      }).from(users);
      res.json(list);
    } catch (err) {
      res.json([]);
    }
  });

  // API - Session Logout
  app.post('/api/session-logout', (req, res) => {
    res.clearCookie('__session', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    res.clearCookie('__session_bypass', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    res.json({ status: 'success' });
  });

  // API - Me profile check
  app.get('/api/me', requireAuth, (req: AuthRequest, res) => {
    res.json({ user: req.user });
  });

  // API - Admin: List users & drivers
  app.get('/api/admin/users', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const list = await db.select().from(users);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // API - Admin: Create driver/user record by email
  app.post('/api/admin/users', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin only' });
    }

    const { email, name, role, password } = req.body;
    if (!email || !name || !role || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (existing.length > 0) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const hashedPassword = hashPassword(password);
      const newUser = await db.insert(users).values({
        email: normalizedEmail,
        name,
        role,
        password: hashedPassword,
        uid: `local_${Date.now()}`,
      }).returning();

      res.json(newUser[0]);
    } catch (err) {
      console.error('User creation failed:', err);
      res.status(500).json({ error: 'Database failed to create user' });
    }
  });

  // API - Admin: Get available drivers (drivers not yet assigned to a bus)
  app.get('/api/admin/drivers', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const drivers = await db.select().from(users).where(eq(users.role, 'driver'));
      res.json(drivers);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch drivers' });
    }
  });

  // API - Admin: Create bus and schedules
  app.post('/api/admin/buses', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { busNumber, name, schedules: sList } = req.body;
    if (!busNumber || !name) {
      return res.status(400).json({ error: 'Missing busNumber or name' });
    }

    try {
      const existing = await db.select().from(buses).where(eq(buses.busNumber, busNumber)).limit(1);
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Bus number already exists' });
      }

      const newBuses = await db.insert(buses).values({
        busNumber: busNumber.toUpperCase().trim(),
        name,
      }).returning();
      const bus = newBuses[0];

      if (Array.isArray(sList) && sList.length > 0) {
        const parsedSchedules = sList.map(s => ({
          busId: bus.id,
          routeFrom: s.routeFrom,
          routeTo: s.routeTo,
          departureTime: s.departureTime,
          arrivalTime: s.arrivalTime,
        }));
        await db.insert(schedules).values(parsedSchedules);
      }

      res.json(bus);
    } catch (err) {
      console.error('Bus creation error:', err);
      res.status(500).json({ error: 'Failed to create bus' });
    }
  });

  // API - Admin: Assign Bus to Driver
  app.post('/api/admin/assignments', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { busId, driverId } = req.body;
    if (!busId || !driverId) {
      return res.status(400).json({ error: 'Missing busId or driverId' });
    }

    try {
      // Check driver exists and is driver
      const drv = await db.select().from(users).where(and(eq(users.id, driverId), eq(users.role, 'driver'))).limit(1);
      if (drv.length === 0) {
        return res.status(400).json({ error: 'Selected user is not a valid driver' });
      }

      // Update or insert assignment
      const existing = await db.select().from(assignments).where(eq(assignments.busId, busId)).limit(1);
      let result;
      if (existing.length > 0) {
        result = await db.update(assignments)
          .set({ driverId })
          .where(eq(assignments.busId, busId))
          .returning();
      } else {
        result = await db.insert(assignments)
          .values({ busId, driverId })
          .returning();
      }

      res.json(result[0]);
    } catch (err) {
      console.error('Assignment error:', err);
      res.status(500).json({ error: 'Database failed to assign driver' });
    }
  });

  // API - Admin: Unassign Driver from Bus
  app.delete('/api/admin/assignments/:busId', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const busId = parseInt(req.params.busId);
    if (isNaN(busId)) {
      return res.status(400).json({ error: 'Invalid bus ID' });
    }
    try {
      await db.delete(assignments).where(eq(assignments.busId, busId));
      res.json({ success: true, message: 'Driver unassigned successfully' });
    } catch (err) {
      console.error('Unassign error:', err);
      res.status(500).json({ error: 'Failed to unassign driver' });
    }
  });

  // API - Admin: Delete Bus (cascades schedules & assignments)
  app.delete('/api/admin/buses/:id', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const busId = parseInt(req.params.id);
    if (isNaN(busId)) {
      return res.status(400).json({ error: 'Invalid bus ID' });
    }
    try {
      await db.delete(buses).where(eq(buses.id, busId));
      res.json({ success: true, message: 'Bus and associated data deleted successfully' });
    } catch (err) {
      console.error('Delete bus error:', err);
      res.status(500).json({ error: 'Failed to delete bus' });
    }
  });

  // API - Admin: Add Schedule to Bus
  app.post('/api/admin/buses/:busId/schedules', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const busId = parseInt(req.params.busId);
    const { routeFrom, routeTo, departureTime, arrivalTime } = req.body;
    if (isNaN(busId) || !routeFrom || !routeTo || !departureTime || !arrivalTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
      const newSchedule = await db.insert(schedules).values({
        busId,
        routeFrom,
        routeTo,
        departureTime,
        arrivalTime,
      }).returning();
      res.json(newSchedule[0]);
    } catch (err) {
      console.error('Add schedule error:', err);
      res.status(500).json({ error: 'Failed to add schedule' });
    }
  });

  // API - Admin: Update Schedule
  app.put('/api/admin/schedules/:id', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const id = parseInt(req.params.id);
    const { routeFrom, routeTo, departureTime, arrivalTime } = req.body;
    if (isNaN(id) || !routeFrom || !routeTo || !departureTime || !arrivalTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
      const updated = await db.update(schedules)
        .set({ routeFrom, routeTo, departureTime, arrivalTime })
        .where(eq(schedules.id, id))
        .returning();
      res.json(updated[0]);
    } catch (err) {
      console.error('Update schedule error:', err);
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  });

  // API - Admin: Delete Schedule
  app.delete('/api/admin/schedules/:id', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid schedule ID' });
    }
    try {
      await db.delete(schedules).where(eq(schedules.id, id));
      res.json({ success: true });
    } catch (err) {
      console.error('Delete schedule error:', err);
      res.status(500).json({ error: 'Failed to delete schedule' });
    }
  });

  // API - Admin: Dashboard metrics
  app.get('/api/admin/dashboard', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    try {
      const allBuses = await db.select().from(buses);
      const allDrivers = await db.select().from(users).where(eq(users.role, 'driver'));
      
      const activeAssignments = await db.select({
        assignmentId: assignments.id,
        busId: buses.id,
        busNumber: buses.busNumber,
        busName: buses.name,
        isRunning: buses.isRunning,
        lastLatitude: buses.lastLatitude,
        lastLongitude: buses.lastLongitude,
        lastUpdated: buses.lastUpdated,
        odometer: buses.odometer,
        engineHours: buses.engineHours,
        sosActive: buses.sosActive,
        sosMessage: buses.sosMessage,
        driverId: users.id,
        driverName: users.name,
        driverEmail: users.email,
      })
      .from(assignments)
      .innerJoin(buses, eq(assignments.busId, buses.id))
      .innerJoin(users, eq(assignments.driverId, users.id));

      res.json({
        totalBuses: allBuses.length,
        totalDrivers: allDrivers.length,
        runningBuses: allBuses.filter(b => b.isRunning).length,
        assignments: activeAssignments,
      });
    } catch (err) {
      console.error('Dashboard fetching error:', err);
      res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
  });

  // API - Driver: Get assigned bus and schedules
  app.get('/api/driver/assigned-bus', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'driver') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    try {
      const ass = await db.select({
        id: buses.id,
        busId: buses.id,
        busNumber: buses.busNumber,
        name: buses.name,
        busName: buses.name,
        isRunning: buses.isRunning,
        lastLatitude: buses.lastLatitude,
        lastLongitude: buses.lastLongitude,
        odometer: buses.odometer,
        engineHours: buses.engineHours,
        sosActive: buses.sosActive,
        sosMessage: buses.sosMessage,
      })
      .from(assignments)
      .innerJoin(buses, eq(assignments.busId, buses.id))
      .where(eq(assignments.driverId, req.user.dbId));

      if (ass.length === 0) {
        return res.json({ assigned: false, buses: [] });
      }

      const busesWithSchedules = [];
      for (const b of ass) {
        const listSchedules = await db.select().from(schedules).where(eq(schedules.busId, b.busId));
        busesWithSchedules.push({
          ...b,
          schedules: listSchedules,
        });
      }

      res.json({
        assigned: true,
        bus: busesWithSchedules[0],
        schedules: busesWithSchedules[0].schedules,
        buses: busesWithSchedules,
      });
    } catch (err) {
      console.error('Driver assigned bus query error:', err);
      res.status(500).json({ error: 'Failed to fetch driver schedules' });
    }
  });

  // API - Driver: Toggle running state
  app.post('/api/driver/toggle-driving', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'driver') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { busId, isRunning, latitude, longitude } = req.body;
    if (!busId) {
      return res.status(400).json({ error: 'Missing busId' });
    }

    try {
      const ass = await db.select()
        .from(assignments)
        .where(and(eq(assignments.busId, busId), eq(assignments.driverId, req.user.dbId)))
        .limit(1);

      if (ass.length === 0) {
        return res.status(403).json({ error: 'Forbidden: Driver not assigned to this bus' });
      }

      const now = new Date();
      await db.update(buses)
        .set({
          isRunning,
          lastLatitude: isRunning ? latitude : null,
          lastLongitude: isRunning ? longitude : null,
          lastUpdated: isRunning ? now : null,
        })
        .where(eq(buses.id, busId));

      if (isRunning && latitude !== undefined && longitude !== undefined) {
        await db.insert(locationLogs).values({
          busId,
          driverId: req.user.dbId,
          latitude,
          longitude,
        });
      }

      res.json({ success: true, isRunning });
    } catch (err) {
      console.error('Toggle driving error:', err);
      res.status(500).json({ error: 'Failed to start/stop driving' });
    }
  });

  // API - Driver: Toggle Emergency SOS
  app.post('/api/driver/toggle-sos', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'driver') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { busId, sosActive, sosMessage } = req.body;
    if (!busId) {
      return res.status(400).json({ error: 'Missing busId' });
    }

    try {
      const ass = await db.select()
        .from(assignments)
        .where(and(eq(assignments.busId, busId), eq(assignments.driverId, req.user.dbId)))
        .limit(1);

      if (ass.length === 0) {
        return res.status(403).json({ error: 'Forbidden: Driver not assigned to this bus' });
      }

      await db.update(buses)
        .set({
          sosActive: !!sosActive,
          sosMessage: sosActive ? (sosMessage || 'EMERGENCY SOS: Driver reported urgent assistance required!') : '',
        })
        .where(eq(buses.id, busId));

      res.json({ success: true, sosActive, sosMessage });
    } catch (err) {
      console.error('Toggle SOS error:', err);
      res.status(500).json({ error: 'Failed to toggle Emergency SOS' });
    }
  });

  // API - Driver: Receive continuous GPS updates
  app.post('/api/driver/location', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'driver') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { busId, latitude, longitude } = req.body;
    if (!busId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Missing required location params' });
    }

    try {
      const ass = await db.select()
        .from(assignments)
        .where(and(eq(assignments.busId, busId), eq(assignments.driverId, req.user.dbId)))
        .limit(1);

      if (ass.length === 0) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await db.update(buses)
        .set({
          lastLatitude: latitude,
          lastLongitude: longitude,
          lastUpdated: new Date(),
        })
        .where(eq(buses.id, busId));

      await db.insert(locationLogs).values({
        busId,
        driverId: req.user.dbId,
        latitude,
        longitude,
      });

      res.json({ success: true });
    } catch (err) {
      console.error('Location stream error:', err);
      res.status(500).json({ error: 'Failed to update coordinates' });
    }
  });

  // API - Rider: View all buses, schedules, driver names, and coordinates
  app.get('/api/buses', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await db.select().from(buses);
      const outputList = await Promise.all(list.map(async (bus) => {
        const listSchedules = await db.select().from(schedules).where(eq(schedules.busId, bus.id));
        const ass = await db.select({
          driverName: users.name,
        })
        .from(assignments)
        .innerJoin(users, eq(assignments.driverId, users.id))
        .where(eq(assignments.busId, bus.id))
        .limit(1);

        return {
          id: bus.id,
          busNumber: bus.busNumber,
          name: bus.name,
          isRunning: bus.isRunning,
          lastLatitude: bus.lastLatitude,
          lastLongitude: bus.lastLongitude,
          lastUpdated: bus.lastUpdated,
          odometer: bus.odometer,
          engineHours: bus.engineHours,
          sosActive: bus.sosActive,
          sosMessage: bus.sosMessage,
          schedules: listSchedules,
          driverName: ass.length > 0 ? ass[0].driverName : 'No driver assigned',
        };
      }));

      res.json(outputList);
    } catch (err) {
      console.error('Buses listing error:', err);
      res.status(500).json({ error: 'Failed to fetch buses list' });
    }
  });

  // API - Rider: View historical location log traces
  app.get('/api/buses/:id/history', requireAuth, async (req: AuthRequest, res) => {
    const busId = parseInt(req.params.id);
    if (isNaN(busId)) {
      return res.status(400).json({ error: 'Invalid bus ID' });
    }

    try {
      const logs = await db.select()
        .from(locationLogs)
        .where(eq(locationLogs.busId, busId))
        .orderBy(desc(locationLogs.timestamp))
        .limit(30);

      res.json(logs);
    } catch (err) {
      console.error('Log trace history query error:', err);
      res.status(500).json({ error: 'Failed to load trace logs' });
    }
  });

  // API - Admin: View detailed historical logs for a specific bus
  app.get('/api/admin/buses/:id/logs', requireAuth, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const busId = parseInt(req.params.id);
    if (isNaN(busId)) {
      return res.status(400).json({ error: 'Invalid bus ID' });
    }

    try {
      const logs = await db.select({
        id: locationLogs.id,
        latitude: locationLogs.latitude,
        longitude: locationLogs.longitude,
        timestamp: locationLogs.timestamp,
        driverId: locationLogs.driverId,
        driverName: users.name,
        driverEmail: users.email,
      })
      .from(locationLogs)
      .innerJoin(users, eq(locationLogs.driverId, users.id))
      .where(eq(locationLogs.busId, busId))
      .orderBy(desc(locationLogs.timestamp))
      .limit(200);

      res.json(logs);
    } catch (err) {
      console.error('Admin query logs error:', err);
      res.status(500).json({ error: 'Failed to fetch historical logs' });
    }
  });

  // Serve static assets / Vite files
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express custom server running on http://localhost:${PORT}`);
  });
}

startServer();
