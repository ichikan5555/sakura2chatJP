#!/bin/bash

# Test Multi-User API Implementation

API="http://localhost:3001"
echo "=== Multi-User API Test ==="
echo

# 1. Test Admin Login
echo "1. Testing Admin Login..."
ADMIN_COOKIE=$(curl -s -X POST "$API/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}' \
  -c - | grep s2c_session | awk '{print $7}')

if [ -n "$ADMIN_COOKIE" ]; then
  echo "✓ Admin login successful"
else
  echo "✗ Admin login failed"
  exit 1
fi
echo

# 2. Check admin session
echo "2. Checking admin session..."
curl -s "$API/api/auth/me" -H "Cookie: s2c_session=$ADMIN_COOKIE" | jq .
echo

# 3. Create a test user
echo "3. Creating test user..."
curl -s -X POST "$API/api/admin/users" \
  -H "Content-Type: application/json" \
  -H "Cookie: s2c_session=$ADMIN_COOKIE" \
  -d '{"username":"testuser","password":"test123","email":"test@example.com","display_name":"Test User"}' | jq .
echo

# 4. Get all users
echo "4. Getting all users..."
curl -s "$API/api/admin/users" -H "Cookie: s2c_session=$ADMIN_COOKIE" | jq .
echo

# 5. Test user login
echo "5. Testing user login..."
USER_COOKIE=$(curl -s -X POST "$API/api/auth/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123"}' \
  -c - | grep s2c_session | awk '{print $7}')

if [ -n "$USER_COOKIE" ]; then
  echo "✓ User login successful"
else
  echo "✗ User login failed"
fi
echo

# 6. Check user session
echo "6. Checking user session..."
curl -s "$API/api/auth/me" -H "Cookie: s2c_session=$USER_COOKIE" | jq .
echo

# 7. User tries to access admin endpoint (should fail)
echo "7. Testing user access to admin endpoint (should fail)..."
curl -s "$API/api/admin/users" -H "Cookie: s2c_session=$USER_COOKIE" | jq .
echo

# 8. Get admin monitor overview
echo "8. Getting admin monitor overview..."
curl -s "$API/api/admin/monitor/overview" -H "Cookie: s2c_session=$ADMIN_COOKIE" | jq .
echo

echo "=== Test Complete ==="
