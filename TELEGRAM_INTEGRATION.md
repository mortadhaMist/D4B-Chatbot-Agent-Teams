# 🤖 Telegram Bot Database Integration

Your Telegram bot is now fully integrated with your database! Here's how to set it up and what it does:

## 🚀 Setup Instructions

### 1. Get a Telegram Bot Token
1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot`
3. Choose a name and username for your bot
4. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrSTUvwxyz`)

### 2. Add Token to Environment
Add this line to your `.env` file:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### 3. Restart Your Server
```bash
node server.js
```

You should see: `🤖 Telegram bot started successfully`

## 🎯 How It Works

### **Guest Registration Flow:**
1. **User starts chat** → Bot requests name and room number
2. **User provides info** → Bot creates guest in database
3. **Auto-approval** → Telegram guests are automatically approved
4. **Ready to serve** → Bot can now log requests and conversations

### **Service Request Flow:**
1. **User makes request** (e.g., "I need a pillow")
2. **Bot detects service** → Logs to database via `/api/requests`
3. **Confirmation sent** → User gets confirmation message
4. **Staff sees request** → Appears in all your management interfaces

### **Conversation Logging:**
- **Every message** is automatically logged to database
- **Links to guest profile** via room number lookup
- **Visible in database viewer** with timestamps and guest info

## 📱 User Experience

### Registration Examples:
```
User: John Smith, Room 204
User: Room 204, John Smith  
User: John Smith 204
User: 204 John Smith
```

### Service Request Examples:
```
User: I need a pillow
Bot: ✅ Pillow Request Confirmed
     Hello John Smith! Your request for a pillow has been forwarded to our housekeeping team...

User: Can you call a taxi?
Bot: ✅ Taxi Request Confirmed
     Hello John Smith! Your taxi request has been forwarded to our reception team...

User: I need a doctor
Bot: 🚨 Medical Request - PRIORITY
     Hello John Smith! Your medical assistance request has been marked as PRIORITY...
```

## 🗄️ Database Integration

### What Gets Stored:

1. **Guests Table:**
   - Telegram users with name/room from registration
   - Created immediately when user registers

2. **Requests Table:**
   - All service requests from Telegram
   - Linked to guest profiles
   - Priority detection (NORMAL/PRIORITY)

3. **Conversations Table:**
   - Every chat message and bot response
   - Timestamps and guest associations
   - Full conversation history

### Where to View:

- **Database Viewer**: `http://localhost:8080/database.html`
- **Staff Dashboard**: `http://localhost:8080/dashboard-simple.html`
- **Request Logs**: `http://localhost:8080/log.html`

## 🔧 Features

### ✅ **Automatic Features:**
- Guest registration and database storage
- Service request detection and logging
- Conversation history tracking
- Priority request detection
- Auto-approval for Telegram users

### 🎛️ **Staff Features:**
- View Telegram guests in database viewer
- See all requests from both web and Telegram
- Complete conversation history
- Real-time request notifications

### 🤖 **Bot Commands:**
- `/start` - Welcome message
- `/help` - Show available commands
- `/faq` - Frequently asked questions
- `/services` - Hotel services and amenities
- `/contact` - Contact information

## 🔍 Testing

1. **Find your bot** on Telegram (search for the username you created)
2. **Send `/start`** to begin
3. **Register** with your name and room number
4. **Make a request** like "I need a pillow"
5. **Check database viewer** to see the data

## 🔗 Integration Points

The Telegram bot connects to your system through:

- **`/api/guest-sessions`** - Creates guests in database
- **`/api/requests`** - Logs service requests  
- **`/api/chat`** - AI conversations with logging
- **Same database** - All data visible in web interfaces

## 🎉 Benefits

- **Unified guest management** - Web and Telegram users in same database
- **Complete conversation tracking** - Never lose chat history
- **Automatic request logging** - No manual data entry needed
- **Real-time staff notifications** - Instant visibility of all requests
- **Consistent user experience** - Same service quality across channels

Your Telegram bot is now a fully integrated part of your hotel management system! 🏨✨
