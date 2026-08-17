/**
 * MongoDB connection — a single cached client.
 *
 * Lazy: nothing connects until the first DB call. The promise is cached so that
 * a warm serverless instance (and dev hot-reload) reuses one connection pool
 * instead of opening a new one per invocation.
 *
 * The MONGODB_URI is not required to boot the app — only to touch the DB. This
 * lets us build and run modules before the connection string is provided.
 */
import { MongoClient, type Db } from "mongodb";
import { config } from "../config";

declare global {
  // eslint-disable-next-line no-var
  var __bootwhatMongo: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient> | undefined;

function getClientPromise(): Promise<MongoClient> {
  if (!config.mongo.uri) {
    throw new Error(
      "[mongo] MONGODB_URI is not set. Add it to your environment to enable persistence."
    );
  }

  // In dev, cache on the global object so hot-reload doesn't open new pools.
  if (config.env !== "production") {
    if (!global.__bootwhatMongo) {
      global.__bootwhatMongo = new MongoClient(config.mongo.uri).connect();
    }
    return global.__bootwhatMongo;
  }

  if (!clientPromise) {
    clientPromise = new MongoClient(config.mongo.uri).connect();
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(config.mongo.dbName);
}
