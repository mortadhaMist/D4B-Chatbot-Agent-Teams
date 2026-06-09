#!/bin/bash

#  KFC France Bot Deployment Script for Render
# This script helps deploy and test your Telegram bot webhook

set -e  # Exit on any error

echo " KFC France Bot Deployment & Testing Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
RENDER_URL="https://solaria-bot-v3.onrender.com"
WEBHOOK_ENDPOINT="${RENDER_URL}/webhook"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to make HTTP requests
http_get() {
    if command_exists curl; then
        curl -s "$1"
    elif command_exists wget; then
        wget -qO- "$1"
    else
        echo -e "${RED}❌ Neither curl nor wget found. Please install one of them.${NC}"
        exit 1
    fi
}

echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

# Check for required tools
if ! command_exists git; then
    echo -e "${RED}❌ Git not found. Please install Git.${NC}"
    exit 1
fi

if ! command_exists node; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Check if we're in the right directory
if [ ! -f "server.js" ] || [ ! -f "telegram-bot.js" ]; then
    echo -e "${RED}❌ Please run this script from the project root directory${NC}"
    exit 1
fi

echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install

echo -e "${BLUE}🔧 Environment Variables Check...${NC}"

# Check for required environment variables
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  TELEGRAM_BOT_TOKEN not set in environment${NC}"
    echo "Please set it in your Render dashboard or export it:"
    echo "export TELEGRAM_BOT_TOKEN=\"your_bot_token_here\""
else
    echo -e "${GREEN}✅ TELEGRAM_BOT_TOKEN is set${NC}"
fi

if [ -z "$SERVER_URL" ]; then
    echo -e "${YELLOW}⚠️  SERVER_URL not set, will use default: ${RENDER_URL}${NC}"
else
    echo -e "${GREEN}✅ SERVER_URL is set to: $SERVER_URL${NC}"
    RENDER_URL="$SERVER_URL"
    WEBHOOK_ENDPOINT="${RENDER_URL}/webhook"
fi

echo -e "${BLUE}🔄 Deploying to Git (if in git repo)...${NC}"

# Check if we're in a git repository
if [ -d ".git" ]; then
    echo "Adding files to git..."
    git add .
    
    # Check if there are changes to commit
    if ! git diff --cached --quiet; then
        echo "Committing changes..."
        git commit -m "Fix Telegram webhook for Render deployment - $(date '+%Y-%m-%d %H:%M:%S')"
        
        echo "Pushing to remote..."
        git push
        echo -e "${GREEN}✅ Code pushed to repository${NC}"
    else
        echo -e "${YELLOW}⚠️  No changes to commit${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Not in a git repository. Please manually deploy to Render.${NC}"
fi

echo -e "${BLUE}⏳ Waiting for deployment (30 seconds)...${NC}"
sleep 30

echo -e "${BLUE}🧪 Testing deployment...${NC}"

# Test 1: Check if server is responding
echo -e "${BLUE}1. Testing server health...${NC}"
SERVER_RESPONSE=$(http_get "$RENDER_URL" || echo "FAILED")
if [[ "$SERVER_RESPONSE" == *"FAILED"* ]]; then
    echo -e "${RED}❌ Server not responding at $RENDER_URL${NC}"
else
    echo -e "${GREEN}✅ Server is responding${NC}"
fi

# Test 2: Check webhook endpoint
echo -e "${BLUE}2. Testing webhook endpoint...${NC}"
WEBHOOK_RESPONSE=$(http_get "$WEBHOOK_ENDPOINT" || echo "FAILED")
if [[ "$WEBHOOK_RESPONSE" == *"FAILED"* ]]; then
    echo -e "${RED}❌ Webhook endpoint not responding${NC}"
elif [[ "$WEBHOOK_RESPONSE" == *"Webhook endpoint active"* ]]; then
    echo -e "${GREEN}✅ Webhook endpoint is active${NC}"
    echo "Response: $WEBHOOK_RESPONSE"
else
    echo -e "${YELLOW}⚠️  Webhook endpoint responding but with unexpected response:${NC}"
    echo "$WEBHOOK_RESPONSE"
fi

# Test 3: Check Telegram webhook info (if token is available)
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    echo -e "${BLUE}3. Checking Telegram webhook status...${NC}"
    TELEGRAM_API_URL="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
    TELEGRAM_RESPONSE=$(http_get "$TELEGRAM_API_URL" || echo "FAILED")
    
    if [[ "$TELEGRAM_RESPONSE" == *"FAILED"* ]]; then
        echo -e "${RED}❌ Failed to check Telegram webhook status${NC}"
    elif [[ "$TELEGRAM_RESPONSE" == *"\"url\":\"${WEBHOOK_ENDPOINT}\""* ]]; then
        echo -e "${GREEN}✅ Telegram webhook is correctly set${NC}"
        echo "Webhook URL: $WEBHOOK_ENDPOINT"
    else
        echo -e "${YELLOW}⚠️  Telegram webhook status:${NC}"
        echo "$TELEGRAM_RESPONSE" | head -5
    fi
else
    echo -e "${YELLOW}⚠️  Skipping Telegram webhook check (no token available)${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Deployment script completed!${NC}"
echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo "1. Check your Render dashboard for deployment status"
echo "2. Test your bot by sending a message on Telegram"
echo "3. Monitor logs in Render dashboard for any issues"
echo ""
echo -e "${BLUE}🔗 Useful URLs:${NC}"
echo "• Server: $RENDER_URL"
echo "• Webhook: $WEBHOOK_ENDPOINT"
echo "• Chat: $RENDER_URL/chat"
echo "• Logs: $RENDER_URL/log"
echo ""
echo -e "${BLUE}🐛 If issues persist:${NC}"
echo "• Check Render logs for error messages"
echo "• Verify environment variables in Render dashboard"
echo "• Test webhook endpoint manually in browser"
