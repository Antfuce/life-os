# User Memory API Documentation

This document describes the User Memory API endpoints that allow the frontend to manage user memories through the backend API layer.

## Architecture

Following the Life-OS architecture principle: **Frontend → Backend/API → OpenClaw**

- Frontend calls backend API endpoints (not Base44 SDK directly)
- Backend owns the user_memory table and all CRUD operations
- All requests require authentication via `x-user-id` header

## Endpoints

### 1. List User Memories

Retrieve all memories for the authenticated user.

**Endpoint:** `GET /v1/user/memory`

**Authentication:** Required via `x-user-id` header

**Request:**
```http
GET /v1/user/memory HTTP/1.1
x-user-id: user123
```

**Response:** `200 OK`
```json
{
  "memories": [
    {
      "id": "mem_abc123",
      "userId": "user123",
      "category": "career",
      "key": "current_role",
      "value": "Senior Software Engineer",
      "created_date": 1708203600000
    },
    {
      "id": "mem_def456",
      "userId": "user123",
      "category": "lifestyle",
      "key": "location_preference",
      "value": "Remote",
      "created_date": 1708203500000
    }
  ]
}
```

**Error Responses:**
- `401 Unauthorized` - Missing or invalid `x-user-id` header
- `500 Internal Server Error` - Database error

---

### 2. Create User Memory

Create a new memory for the authenticated user.

**Endpoint:** `POST /v1/user/memory`

**Authentication:** Required via `x-user-id` header

**Request:**
```http
POST /v1/user/memory HTTP/1.1
x-user-id: user123
Content-Type: application/json

{
  "category": "career",
  "key": "target_role",
  "value": "Engineering Manager"
}
```

**Response:** `200 OK`
```json
{
  "id": "mem_xyz789",
  "userId": "user123",
  "category": "career",
  "key": "target_role",
  "value": "Engineering Manager",
  "created_date": 1708203700000
}
```

**Error Responses:**
- `400 Bad Request` - Missing required fields (category, key, or value)
- `401 Unauthorized` - Missing or invalid `x-user-id` header
- `500 Internal Server Error` - Database error

---

### 3. Delete User Memory

Delete a specific memory by ID. Users can only delete their own memories.

**Endpoint:** `DELETE /v1/user/memory/:id`

**Authentication:** Required via `x-user-id` header

**Request:**
```http
DELETE /v1/user/memory/mem_xyz789 HTTP/1.1
x-user-id: user123
```

**Response:** `200 OK`
```json
{
  "success": true,
  "id": "mem_xyz789"
}
```

**Error Responses:**
- `400 Bad Request` - Missing memory ID
- `401 Unauthorized` - Missing or invalid `x-user-id` header
- `403 Forbidden` - Attempting to delete another user's memory
- `404 Not Found` - Memory ID not found
- `500 Internal Server Error` - Database error

---

## Data Model

### user_memory Table

| Column       | Type    | Description                                    |
|--------------|---------|------------------------------------------------|
| id           | TEXT    | Primary key, format: `mem_<16-char-hash>`     |
| userId       | TEXT    | User identifier (from x-user-id header)       |
| category     | TEXT    | Memory category (career, lifestyle, travel, social) |
| key          | TEXT    | Memory key (e.g., current_role, location_preference) |
| value        | TEXT    | Memory value                                   |
| created_date | INTEGER | Unix timestamp in milliseconds                 |

**Index:** `idx_user_memory_user_created ON (userId, created_date)`

---

## Frontend Integration

The frontend uses the `apiClient.js` module which provides a clean interface:

```javascript
import { api } from '@/api/apiClient';

// List memories
const memories = await api.memory.list();

// Create memory
const newMemory = await api.memory.create({
  category: 'career',
  key: 'current_role',
  value: 'Senior Developer'
});

// Delete memory
await api.memory.delete('mem_abc123');
```

---

## Security Considerations

1. **Authentication:** All endpoints require `x-user-id` header
2. **Authorization:** Users can only access their own memories
3. **Input Validation:** Required fields are validated on the backend
4. **SQL Injection Protection:** Uses prepared statements for all queries

---

## Migration Notes

This API replaces direct Base44 SDK usage:

**Before (Base44 SDK):**
```javascript
import { base44 } from '@/api/base44Client';
await base44.entities.UserMemory.list("-created_date", 100);
await base44.entities.UserMemory.delete(id);
```

**After (Backend API):**
```javascript
import { api } from '@/api/apiClient';
await api.memory.list();
await api.memory.delete(id);
```

This change aligns with the architecture principle that "Backend/API is the only integration layer" as defined in AGENTS.md.
