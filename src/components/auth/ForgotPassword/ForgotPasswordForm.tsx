import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { instanceNoAuth } from '../../../utils/axiosInstance';
import styles from './ForgotPassword.module.scss';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isErrorVisible, setIsErrorVisible] = useState(false);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Handle message visibility with delay
  useEffect(() => {
    let errorTimeoutId: number;
    let successTimeoutId: number;

    if (error) {
      errorTimeoutId = window.setTimeout(() => {
        setIsErrorVisible(true);
      }, 300);
    } else {
      setIsErrorVisible(false);
    }

    if (success) {
      successTimeoutId = window.setTimeout(() => {
        setIsSuccessVisible(true);
      }, 300);
    } else {
      setIsSuccessVisible(false);
    }

    return () => {
      if (errorTimeoutId) {
        window.clearTimeout(errorTimeoutId);
      }
      if (successTimeoutId) {
        window.clearTimeout(successTimeoutId);
      }
    };
  }, [error, success]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      setIsErrorVisible(true);
      return;
    }

    setError(null);
    setSuccess(null);
    setIsErrorVisible(false);
    setIsSuccessVisible(false);
    setLoading(true);

    try {
      const response = await instanceNoAuth.post('/auth/request-reset', null, {
        params: { email: email }
      });

      if (response.data.message) {
        setSuccess(response.data.message);
        setEmail(''); // Clear form after success
      }
    } catch (err: any) { // Using any type for error handling
      console.log('Error response:', err.response?.data); // Debug log
      if (err.response?.data?.error) {
        setError(err.response.data.error);
        setIsErrorVisible(true); // Explicitly set error visible
      } else {
        setError('Unable to connect to the server. Please try again later.');
        setIsErrorVisible(true); // Explicitly set error visible
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <h2>Reset Password</h2>

        <div className={styles.messageContainer}>
          {error && (
            <div className={`${styles.error} ${isErrorVisible ? styles.visible : ''}`}>
              {error}
            </div>
          )}
          {success && (
            <div className={`${styles.success} ${isSuccessVisible ? styles.visible : ''}`}>
              {success}
            </div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address"
            required
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>

        <div className={styles.links}>
          <Link to="/login">Back to Login</Link>
        </div>
      </form>
    </div>
  );
} 