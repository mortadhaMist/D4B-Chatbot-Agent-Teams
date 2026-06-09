const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class HotelDatabase {
  constructor() {
    this.dbPath = path.join(__dirname, 'data', 'hotel.db');
    this.db = null;
    this.init();
  }

  init() {
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('✅ Connected to SQLite database');
        this.createTables();
      }
    });
  }

  createTables() {
    const createGuestsTable = `
      CREATE TABLE IF NOT EXISTS guests (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        room_number TEXT NOT NULL,
        email TEXT,
        language TEXT DEFAULT 'en',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createRequestsTable = `
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        guest_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY (guest_id) REFERENCES guests (id)
      )
    `;
    const createConversationsTable = `
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        guest_id TEXT NOT NULL,
        message TEXT NOT NULL,
        response TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (guest_id) REFERENCES guests (id)
      )
    `;

    this.db.serialize(() => {
      console.log('[DB] Creating tables...');
      this.db.run(createGuestsTable, (err) => {
        if (err) {
          console.error('[DB] Error creating guests table:', err);
        } else {
          console.log('[DB] Guests table ready');
          this.db.run('ALTER TABLE guests ADD COLUMN email TEXT', (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column name')) {
              console.error('[DB] Error adding email column to guests table:', alterErr);
            }
          });
        }
      });
      this.db.run(createRequestsTable, (err) => {
        if (err) console.error('[DB] Error creating requests table:', err);
        else console.log('[DB] Requests table ready');
      });
      this.db.run(createConversationsTable, (err) => {
        if (err) console.error('[DB] Error creating conversations table:', err);
        else console.log('[DB] Conversations table ready');
      });
      console.log('✅ Database tables created/verified');
    });
  }

  // Guest operations
  async createGuest(name, roomNumber, email = null, language = 'en') {
    const id = uuidv4();
    console.log(`[DB] Creating guest: ${name}, room: ${roomNumber}, email: ${email}, lang: ${language}`);
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO guests (id, name, room_number, email, language) VALUES (?, ?, ?, ?, ?)',
        [id, name, roomNumber, email, language],
        function(err) {
          if (err) {
            console.error(`[DB] Failed to insert guest ${name}:`, err);
            reject(err);
          } else {
            console.log(`[DB] Guest inserted: ${id}`);
            resolve({ id, name, roomNumber, email, language });
          }
        }
      );
    });
  }

  async getGuest(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM guests WHERE id = ?', [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async getGuestByRoom(roomNumber) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM guests WHERE room_number = ?', [roomNumber], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async updateGuest(id, updates) {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    return new Promise((resolve, reject) => {
      this.db.run(`UPDATE guests SET ${fields} WHERE id = ?`, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Request operations
  async createRequest(guestId, type, notes = null, status = 'OPEN', id = null) {
    const requestId = id || uuidv4();
    console.log(`[DB] Creating request: guestId=${guestId}, type=${type}, status=${status}`);
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO requests (id, guest_id, type, status, notes) VALUES (?, ?, ?, ?, ?)',
        [requestId, guestId, type, status, notes],
        function(err) {
          if (err) {
            console.error(`[DB] Failed to insert request for guest ${guestId}:`, err);
            reject(err);
          } else {
            console.log(`[DB] Request inserted: ${requestId}`);
            resolve({ id: requestId, guestId, type, status, notes });
          }
        }
      );
    });
  }

  async getRequests(guestId) {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM requests WHERE guest_id = ? ORDER BY created_at DESC', [guestId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async updateRequestStatus(id, status) {
    return new Promise((resolve, reject) => {
      this.db.run('UPDATE requests SET status = ? WHERE id = ?', [status, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  async getPendingRequests() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM requests WHERE status = "pending" ORDER BY created_at DESC', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Conversation operations
  async logConversation(guestId, message, response) {
    const id = uuidv4();
    console.log(`[DB] Logging conversation for guestId=${guestId}`);
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO conversations (id, guest_id, message, response) VALUES (?, ?, ?, ?)',
        [id, guestId, message, response],
        function(err) {
          if (err) {
            console.error(`[DB] Failed to log conversation for guest ${guestId}:`, err);
            reject(err);
          } else {
            console.log(`[DB] Conversation logged: ${id}`);
            resolve({ id, guestId, message, response });
          }
        }
      );
    });
  }

  async getConversationHistory(guestId, limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM conversations WHERE guest_id = ? ORDER BY timestamp DESC LIMIT ?',
        [guestId, limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.reverse()); // Return in chronological order
          }
        }
      );
    });
  }

  // Utility operations
  async getAllGuests() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM guests ORDER BY created_at DESC', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getGuestWithRequests(guestId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT g.*, 
                COUNT(r.id) as request_count,
                COUNT(CASE WHEN r.status = 'pending' THEN 1 END) as pending_requests
         FROM guests g 
         LEFT JOIN requests r ON g.id = r.guest_id 
         WHERE g.id = ?
         GROUP BY g.id`,
        [guestId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  // Database viewer methods
  async getAllRequests() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT r.*, g.name as guest_name, g.room_number 
         FROM requests r 
         LEFT JOIN guests g ON r.guest_id = g.id 
         ORDER BY r.created_at DESC`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async getAllConversations() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT c.*, g.name as guest_name, g.room_number 
         FROM conversations c 
         LEFT JOIN guests g ON c.guest_id = g.id 
         ORDER BY c.timestamp DESC`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async getDatabaseStats() {
    return new Promise((resolve, reject) => {
      const queries = {
        guests: 'SELECT COUNT(*) as count FROM guests',
        requests: 'SELECT COUNT(*) as count FROM requests',
        conversations: 'SELECT COUNT(*) as count FROM conversations',
        // Consider 'OPEN' as pending for compatibility with legacy JSON statuses
        pending_requests: `SELECT COUNT(*) as count FROM requests WHERE UPPER(status) IN ('OPEN','PENDING')`
      };

      const stats = {};
      const queryKeys = Object.keys(queries);
      let completed = 0;

      queryKeys.forEach(key => {
        this.db.get(queries[key], (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          stats[key] = row.count;
          completed++;
          
          if (completed === queryKeys.length) {
            resolve(stats);
          }
        });
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('✅ Database connection closed');
        }
      });
    }
  }
}

module.exports = new HotelDatabase();
