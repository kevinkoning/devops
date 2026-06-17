const { MongoClient } = require("mongodb");

let client = null;
let db = null;

async function getDb() {
  if (!client) {
    const uri = process.env.MONGO_DB_URL || process.env.MONGO_URL || process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("No MongoDB URI found in environment (MONGO_DB_URL, MONGO_URL, or MONGODB_URI)");
    }
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(process.env.DB_NAME);
  }
  return db;
}

function getClient() {
  return client;
}

module.exports = {
    getDb,
    getClient
};