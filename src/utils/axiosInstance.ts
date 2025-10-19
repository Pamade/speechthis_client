import axios from "axios";

const BASE_URL = import.meta.env.VITE_BASE_URL;

// Create axios instance for non-authenticated requests
export const instanceNoAuth = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Create axios instance for authenticated requests
export const instance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Add request interceptor for authenticated instance
instance.interceptors.request.use(
  (config) => {

    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication required');
    }
    config.headers['Authorization'] = `Bearer ${token}`;
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for authenticated instance
instance.interceptors.response.use(
  (response) => {
    if (response.data?.access_token) {
      const token = response.data.access_token;
      localStorage.setItem('token', token);
      instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    return response;
  },
  async (error) => {
    // Only remove token if it's a 401 from a protected endpoint
    // and not from the stripe verification or success endpoints
    if (error.response?.status === 401 &&
      !error.config.url?.includes('/stripe/verify-session') &&
      !error.config.url?.includes('/success')) {
      localStorage.removeItem('token');
      delete instance.defaults.headers.common['Authorization'];
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Remove token handling from instanceNoAuth since it should only be used for non-authenticated requests
instanceNoAuth.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

instanceNoAuth.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    if (error.response) {
      console.log('Error response:', error.response.data);
    }
    return Promise.reject(error);
  }
);