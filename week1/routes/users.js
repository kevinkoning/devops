var express = require('express');
var router = express.Router();
 
const { getDb } = require("../services/database");
 
/* GET users listing. */
router.get('/', async function(req, res, _next) {
  try {
    const db = await getDb();
    let users = await db.collection('users').find().toArray();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
router.post('/', async function(req, res, _next){
  try {
    const db = await getDb();
    const result = await db.collection('users').insertOne(req.body);
    res.status(201).json({ "id": result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
})
 
module.exports = router;
