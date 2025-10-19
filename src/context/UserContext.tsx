import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types/user';
import type { UserLoginRequest, UserRegisterRequest, RequestPasswordReset, AuthResponse } from '../types/auth';
import { instanceNoAuth, instance } from '../utils/axiosInstance';
import type { AxiosError } from 'axios';

interface UserContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (data: UserLoginRequest) => Promise<void>;
  logout: () => void;
  register: (data: UserRegisterRequest) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  verifyResetToken: (token: string) => Promise<void>;
  resetPassword: (data: RequestPasswordReset) => Promise<void>;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (data: UserLoginRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await instanceNoAuth.post<AuthResponse>('/auth/login', data);
      console.log(response.data)
      if (response.data.error) {
        setError(response.data.error);
        throw new Error(response.data.error);
      }

      if (response.data.access_token) {
        const token = response.data.access_token;
        // Store token in localStorage
        localStorage.setItem('token', token);
        // Set token in axios headers
        instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        try {
          // Fetch user data
          const userResponse = await instance.get('/auth-protected/me');
          console.log(userResponse)
          setUser(userResponse.data);
        } catch (userError) {
          // Don't fail login if user data fetch fails
          console.error('Error fetching user data:', userError);
        }
        return; // Successfully logged in
      }

      throw new Error('No access token received');
    } catch (err: any) {
      if (err?.message === 'No access token received') {
        throw err;
      }
      const error = err as AxiosError<AuthResponse>;
      const errorMessage = error.response?.data?.error || 'Failed to login';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (data: UserRegisterRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await instanceNoAuth.post<AuthResponse>('/auth/register', data);

      // If we have an access_token, registration was successful
      if (response.data.access_token) {
        const token = response.data.access_token;
        localStorage.setItem('token', token);
        instanceNoAuth.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        try {
          const userResponse = await instance.get('/auth-protected/me');
          setUser(userResponse.data.user);
        } catch (userError) {
          console.error('Error fetching user data:', userError);
        }
        return;
      }

      // If we get here with no token, throw error
      throw new Error('Registration failed');
    } catch (err: any) {
      // Handle axios error response with validation errors
      if (err?.response?.data) {
        const errorData = err.response.data;
        if (errorData.userExists) {
          setError(errorData.userExists);
          throw new Error(errorData.userExists);
        }
        if (errorData.fields) {
          setError(errorData.fields);
          throw new Error(errorData.fields);
        }
        if (errorData.email) {
          setError(errorData.email);
          throw new Error(errorData.email);
        }
        if (errorData.password) {
          setError(errorData.password);
          throw new Error(errorData.password);
        }
        if (errorData.repeatPassword) {
          setError(errorData.repeatPassword);
          throw new Error(errorData.repeatPassword);
        }
        if (errorData.server) {
          setError(errorData.server);
          throw new Error(errorData.server);
        }
      }

      // If no specific error found in response, use generic error
      const errorMessage = err?.message || 'Registration failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    delete instanceNoAuth.defaults.headers.common['Authorization'];
    setUser(null);
    setError(null);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    setError(null);
    try {
      await instanceNoAuth.post('/auth/request-reset', null, {
        params: { email }
      });
    } catch (err) {
      const error = err as AxiosError;
      setError('Failed to send reset link');
      throw new Error('Failed to send reset link');
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyResetToken = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      await instanceNoAuth.get('/auth/verify', {
        params: { token }
      });
    } catch (err) {
      const error = err as AxiosError;
      setError('Invalid verification token');
      throw new Error('Invalid verification token');
    } finally {
      setLoading(false);
    }
  }, []);

  const resetPassword = useCallback(async (data: RequestPasswordReset) => {
    setLoading(true);
    setError(null);
    try {
      const response = await instanceNoAuth.patch<AuthResponse>('/auth/reset-password', data);
      if (response.data.error) {
        setError(response.data.error);
        throw new Error(response.data.error);
      }
    } catch (err) {
      const error = err as AxiosError<AuthResponse>;
      const errorMessage = error.response?.data?.error || 'Failed to reset password';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check for existing token and validate it on mount
  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (token) {
      setLoading(true);
      try {
        instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        const response = await instance.get('/auth-protected/me');
        console.log(response.data)
        setUser(response.data.user);
      } catch (err) {
        // Don't remove token on user data fetch failure
        console.error('Error fetching user data:', err);
      } finally {
        setLoading(false);
      }
    }
  }, []);

  // Call checkAuth when the provider mounts
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    register,
    requestPasswordReset,
    verifyResetToken,
    resetPassword
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
} 