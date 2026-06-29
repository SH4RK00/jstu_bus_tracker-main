import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean, doublePrecision } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(), // Firebase Auth UID, nullable until they login for the first time
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  password: text('password').default(''), // store securely hashed password
  role: text('role').notNull().default('user'), // 'admin', 'driver', 'user'
  createdAt: timestamp('created_at').defaultNow(),
});

export const buses = pgTable('buses', {
  id: serial('id').primaryKey(),
  busNumber: text('bus_number').notNull().unique(),
  name: text('name').notNull(),
  isRunning: boolean('is_running').notNull().default(false),
  lastLatitude: doublePrecision('last_latitude'),
  lastLongitude: doublePrecision('last_longitude'),
  lastUpdated: timestamp('last_updated'),
  odometer: doublePrecision('odometer').default(125430.5),
  engineHours: doublePrecision('engine_hours').default(3452.1),
  sosActive: boolean('sos_active').default(false),
  sosMessage: text('sos_message').default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

export const schedules = pgTable('schedules', {
  id: serial('id').primaryKey(),
  busId: integer('bus_id')
    .references(() => buses.id, { onDelete: 'cascade' })
    .notNull(),
  routeFrom: text('route_from').notNull(),
  routeTo: text('route_to').notNull(),
  departureTime: text('departure_time').notNull(), // e.g., "08:30"
  arrivalTime: text('arrival_time').notNull(),   // e.g., "09:30"
  createdAt: timestamp('created_at').defaultNow(),
});

export const assignments = pgTable('assignments', {
  id: serial('id').primaryKey(),
  busId: integer('bus_id')
    .references(() => buses.id, { onDelete: 'cascade' })
    .notNull()
    .unique(), // Ensure a bus can only have one active driver assignment
  driverId: integer('driver_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  assignedAt: timestamp('assigned_at').defaultNow(),
});

export const locationLogs = pgTable('location_logs', {
  id: serial('id').primaryKey(),
  busId: integer('bus_id')
    .references(() => buses.id, { onDelete: 'cascade' })
    .notNull(),
  driverId: integer('driver_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// Relationships
export const usersRelations = relations(users, ({ many }) => ({
  assignments: many(assignments),
  locationLogs: many(locationLogs),
}));

export const busesRelations = relations(buses, ({ many, one }) => ({
  schedules: many(schedules),
  assignment: one(assignments, {
    fields: [buses.id],
    references: [assignments.busId],
  }),
  locationLogs: many(locationLogs),
}));

export const schedulesRelations = relations(schedules, ({ one }) => ({
  bus: one(buses, {
    fields: [schedules.busId],
    references: [buses.id],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  bus: one(buses, {
    fields: [assignments.busId],
    references: [buses.id],
  }),
  driver: one(users, {
    fields: [assignments.driverId],
    references: [users.id],
  }),
}));

export const locationLogsRelations = relations(locationLogs, ({ one }) => ({
  bus: one(buses, {
    fields: [locationLogs.busId],
    references: [buses.id],
  }),
  driver: one(users, {
    fields: [locationLogs.driverId],
    references: [users.id],
  }),
}));
