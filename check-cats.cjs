const Database = require('./node_modules/better-sqlite3');
const db = new Database('./finance.db');
const cats = db.prepare('SELECT id, name, \group\, budget_type FROM categories ORDER BY name LIMIT 30').all();
console.log(JSON.stringify(cats, null, 2));
const txCount = db.prepare("SELECT COUNT(*) as c FROM transactions WHERE category_id IS NOT NULL").get();
console.log('Transactions with category:', txCount);
db.close();
