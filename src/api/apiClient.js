// API Client for backend endpoints
// Replaces direct Base44 SDK calls with backend API calls

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/**
 * Get the current user ID
 * In a real app, this would come from authentication context
 * For now, using a default value or from localStorage
 */
function getUserId() {
  // Try to get from localStorage first (set during login or session)
  const storedUserId = localStorage.getItem('userId');
  if (storedUserId) return storedUserId;
  
  // Fallback to a default user for development
  return 'default-user';
}

/**
 * Generic API request helper
 */
async function apiRequest(endpoint, options = {}) {
  const userId = getUserId();
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Memory API methods
 */
export const memory = {
  /**
   * List all memories for the authenticated user
   * @returns {Promise<Array>} Array of memory objects
   */
  async list() {
    const data = await apiRequest('/v1/user/memory');
    return data.memories || [];
  },

  /**
   * Create a new memory
   * @param {Object} memoryData - Memory data
   * @param {string} memoryData.category - Category (career, lifestyle, travel, social)
   * @param {string} memoryData.key - Memory key
   * @param {string} memoryData.value - Memory value
   * @returns {Promise<Object>} Created memory object
   */
  async create({ category, key, value }) {
    return apiRequest('/v1/user/memory', {
      method: 'POST',
      body: JSON.stringify({ category, key, value }),
    });
  },

  /**
   * Delete a memory by ID
   * @param {string} id - Memory ID to delete
   * @returns {Promise<Object>} Deletion result
   */
  async delete(id) {
    return apiRequest(`/v1/user/memory/${id}`, {
      method: 'DELETE',
    });
  },
};

// Default export with all API namespaces
export const api = {
  memory,
};

export default api;
