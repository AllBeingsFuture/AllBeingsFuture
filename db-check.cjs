const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const dbPath = path.join(os.homedir(), '.allbeingsfuture', 'allbeingsfuture.db');
const db = new Database(dbPath, { readonly: true });

// Get table schema
var cols = db.prepare("PRAGMA table_info(sessions)").all();
console.log('Columns:', cols.map(function(c){return c.name}).join(', '));

var sessions = db.prepare('SELECT id, name, status, parent_session_id FROM sessions').all();
console.log('Total: ' + sessions.length + ' sessions');
sessions.forEach(function(s) { console.log('  [' + s.status + '] ' + s.id.slice(0,12) + '  name=' + (s.name||'').slice(0,40) + '  parent=' + (s.parent_session_id || '-')); });
db.close();
require('electron').app.quit();
