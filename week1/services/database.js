const { MongoClient } = require("mongodb");
 
const uri = "mongodb://localhost:27017";
 
const client = new MongoClient(uri);
 
const db = client.db("mydb");
 
module.exports = {
    db: db,
    client: client
};