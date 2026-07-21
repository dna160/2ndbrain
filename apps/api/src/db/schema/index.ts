/**
 * Schema barrel — passed to drizzle() for relational queries and to drizzle-kit for
 * migration generation. One import surface for the whole data model.
 */
// _enums MUST be exported here: drizzle-kit only emits CREATE TYPE for pgEnums reachable
// from this entry point. Without it, generated migrations reference enum types they never
// create (`type "user_role" does not exist`) — tables still typecheck because they import
// the enum objects directly, so the gap only surfaces when migrating a real database.
export * from './_enums';
export * from './tenancy';
export * from './events';
export * from './meetings';
export * from './memory';
export * from './calendar';
export * from './ops';
