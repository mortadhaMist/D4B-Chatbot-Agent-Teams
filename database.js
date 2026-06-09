const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class HotelDatabase {
  constructor() {
    this.dbPath = path.join(__dirname, 'data', 'hotel.db');
    this.db = null;
    this.SQL = null;
    this.initialized = false;
  }

  async init() {
    try {
      this.SQL = await initSqlJs();
      
      // Try to load existing database from file
      if (fs.existsSync(this.dbPath)) {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(fileBuffer);
        console.log('✅ Loaded existing SQLite database from file');
      } else {
        // Create new database
        this.db = new this.SQL.Database();
        console.log('✅ Created new SQLite database');
      }
      
      await this.createTables();
      this.initialized = true;
    } catch (err) {
      console.error('Error initializing database:', err);
      throw err;
    }
  }

  saveDatabase() {
    try {
      if (!this.db) return;
      
      // Ensure data directory exists
      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error('Error saving database:', err);
    }
  }

  async createTables() {
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

    try {
      console.log('[DB] Creating tables...');
      this.db.run(createGuestsTable);
      console.log('[DB] Guests table ready');
      
      this.db.run(createRequestsTable);
      console.log('[DB] Requests table ready');
      
      this.db.run(createConversationsTable);
      console.log('[DB] Conversations table ready');
      
      this.saveDatabase();
      console.log('✅ Database tables created/verified');
    } catch (err) {
      console.error('[DB] Error creating tables:', err);
    }
  }

  // Guest operations
  async createGuest(name, roomNumber, email = null, language = 'en') {
    const id = uuidv4();
    console.log(`[DB] Creating guest: ${name}, room: ${roomNumber}, email: ${email}, lang: ${language}`);
    
    try {
      this.db.run(
        'INSERT INTO guests (id, name, room_number, email, language) VALUES (?, ?, ?, ?, ?)',
        [id, name, roomNumber, email, language]
      );
      this.saveDatabase();
      console.log(`[DB] Guest inserted: ${id}`);
      return { id, name, roomNumber, email, language };
    } catch (err) {
      console.error(`[DB] Failed to insert guest ${name}:`, err);
      throw err;
    }
  }

  async getGuest(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM guests WHERE id = ?');
      stmt.bind([id]);
      const result = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      return result;
    } catch (err) {
      console.error(`[DB] Error getting guest ${id}:`, err);
      throw err;
    }
  }

  async getGuestByRoom(roomNumber) {
    try {
      const stmt = this.db.prepare('SELECT * FROM guests WHERE room_number = ?');
      stmt.bind([roomNumber]);
      const result = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      return result;
    } catch (err) {
      console.error(`[DB] Error getting guest by room ${roomNumber}:`, err);
      throw err;
    }
  }

  async updateGuest(id, updates) {
    try {
      const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(id);
      
      this.db.run(`UPDATE guests SET ${fields} WHERE id = ?`, values);
      this.saveDatabase();
      return { changes: 1 };
    } catch (err) {
      console.error(`[DB] Error updating guest ${id}:`, err);
      throw err;
    }
  }

  // Request operations
  async createRequest(guestId, type, notes = null, status = 'OPEN', id = null) {
    const requestId = id || uuidv4();
    console.log(`[DB] Creating request: guestId=${guestId}, type=${type}, status=${status}`);
    
    try {
      this.db.run(
        'INSERT INTO requests (id, guest_id, type, status, notes) VALUES (?, ?, ?, ?, ?)',
        [requestId, guestId, type, status, notes]
      );
      this.saveDatabase();
      console.log(`[DB] Request inserted: ${requestId}`);
      return { id: requestId, guestId, type, status, notes };
    } catch (err) {
      console.error(`[DB] Failed to insert request for guest ${guestId}:`, err);
      throw err;
    }
  }

  async getRequests(guestId) {
    try {
      const stmt = this.db.prepare('SELECT * FROM requests WHERE guest_id = ? ORDER BY created_at DESC');
      stmt.bind([guestId]);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    } catch (err) {
      console.error(`[DB] Error getting requests for guest ${guestId}:`, err);
      throw err;
    }
  }

  async updateRequestStatus(id, status) {
    try {
      this.db.run('UPDATE requests SET status = ? WHERE id = ?', [status, id]);
      this.saveDatabase();
      return { changes: 1 };
    } catch (err) {
      console.error(`[DB] Error updating request ${id}:`, err);
      throw err;
    }
  }

  async getPendingRequests() {
    try {
      const stmt = this.db.prepare('SELECT * FROM requests WHERE status = "pending" ORDER BY created_at DESC');
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    } catch (err) {
      console.error(`[DB] Error getting pending requests:`, err);
      throw err;
    }
  }

  // Conversation operations
  async logConversation(guestId, message, response) {
    const id = uuidv4();
    console.log(`[DB] Logging conversation for guestId=${guestId}`);
    
    try {
      this.db.run(
        'INSERT INTO conversations (id, guest_id, message, response) VALUES (?, ?, ?, ?)',
        [id, guestId, message, response]
      );
      this.saveDatabase();
      console.log(`[DB] Conversation logged: ${id}`);
      return { id, guestId, message, response };
    } catch (err) {
      console.error(`[DB] Failed to log conversation for guest ${guestId}:`, err);
      throw err;
    }
  }

  async getConversationHistory(guestId, limit = 10) {
    try {
      const stmt = this.db.prepare('SELECT * FROM conversations WHERE guest_id = ? ORDER BY timestamp DESC LIMIT ?');
      stmt.bind([guestId, limit]);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows.reverse(); // Return in chronological order
    } catch (err) {
      console.error(`[DB] Error getting conversation history for guest ${guestId}:`, err);
      throw err;
    }
  }

  // Utility operations
  async getAllGuests() {
    try {
      const stmt = this.db.prepare('SELECT * FROM guests ORDER BY created_at DESC');
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    } catch (err) {
      console.error(`[DB] Error getting all guests:`, err);
      throw err;
    }
  }

  async getGuestWithRequests(guestId) {
    try {
      const stmt = this.db.prepare(`
        SELECT g.*, 
                COUNT(r.id) as request_count,
                COUNT(CASE WHEN r.status = 'pending' THEN 1 END) as pending_requests
         FROM guests g 
         LEFT JOIN requests r ON g.id = r.guest_id 
         WHERE g.id = ?
         GROUP BY g.id
      `);
      stmt.bind([guestId]);
      const result = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      return result;
    } catch (err) {
      console.error(`[DB] Error getting guest with requests for ${guestId}:`, err);
      throw err;
    }
  }

  // Database viewer methods
  async getAllRequests() {
    try {
      const stmt = this.db.prepare(`
        SELECT r.*, g.name as guest_name, g.room_number 
         FROM requests r 
         LEFT JOIN guests g ON r.guest_id = g.id 
         ORDER BY r.created_at DESC
      `);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    } catch (err) {
      console.error(`[DB] Error getting all requests:`, err);
      throw err;
    }
  }

  async getAllConversations() {
    try {
      const stmt = this.db.prepare(`
        SELECT c.*, g.name as guest_name, g.room_number 
         FROM conversations c 
         LEFT JOIN guests g ON c.guest_id = g.id 
         ORDER BY c.timestamp DESC
      `);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    } catch (err) {
      console.error(`[DB] Error getting all conversations:`, err);
      throw err;
    }
  }

  async getDatabaseStats() {
    try {
      const queries = {
        guests: 'SELECT COUNT(*) as count FROM guests',
        requests: 'SELECT COUNT(*) as count FROM requests',
        conversations: 'SELECT COUNT(*) as count FROM conversations',
        pending_requests: `SELECT COUNT(*) as count FROM requests WHERE UPPER(status) IN ('OPEN','PENDING')`
      };

      const stats = {};
      for (const key of Object.keys(queries)) {
        const stmt = this.db.prepare(queries[key]);
        if (stmt.step()) {
          stats[key] = stmt.getAsObject().count;
        }
        stmt.free();
      }
      
      return stats;
    } catch (err) {
      console.error(`[DB] Error getting database stats:`, err);
      throw err;
    }
  }

  async getRequestById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM requests WHERE id = ?');
      stmt.bind([id]);
      const result = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      return result;
    } catch (err) {
      console.error(`[DB] Error getting request ${id}:`, err);
      throw err;
    }
  }

  async deleteRequest(id) {
    try {
      this.db.run('DELETE FROM requests WHERE id = ?', [id]);
      this.saveDatabase();
      return { changes: 1 };
    } catch (err) {
      console.error(`[DB] Error deleting request ${id}:`, err);
      throw err;
    }
  }

  async closeDatabase() {
    try {
      if (this.db) {
        this.saveDatabase();
        this.db.close();
        console.log('✅ Database closed');
      }
    } catch (err) {
      console.error('Error closing database:', err);
    }
  }
}

module.exports = HotelDatabase;
