import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { instanceNoAuth } from '../../../utils/axiosInstance';
import styles from './ResetPassword.module.scss';

export function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isErrorVisible, setIsErrorVisible] = useState(false);
    const [isSuccessVisible, setIsSuccessVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    // Get token from URL
    const token = searchParams.get('token');

    // Redirect if no token is present
    useEffect(() => {
        if (!token) {
            alert('Invalid or expired token. Please try again.');
            navigate('/');
        }
    }, [token]);

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

        // Validate passwords
        if (password.length < 6) {
            setError('Password must be at least 6 characters long');
            setIsErrorVisible(true);
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            setIsErrorVisible(true);
            return;
        }

        setError(null);
        setSuccess(null);
        setIsErrorVisible(false);
        setIsSuccessVisible(false);
        setLoading(true);

        try {
            const response = await instanceNoAuth.patch('/auth/reset-password', {
                token,
                password: password,
                repeatPassword: confirmPassword
            });

            if (response.data.message) {
                setSuccess('Password has been successfully reset');
                // Clear form
                setPassword('');
                setConfirmPassword('');
            }
        } catch (err: any) {
            console.log('Error response:', err.response?.data);
            if (err.response?.data?.error) {
                setError(err.response.data.error);
                setIsErrorVisible(true);
            } else {
                setError('Unable to reset password. Please try again later.');
                setIsErrorVisible(true);
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
                    <label htmlFor="password">New Password</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter new password"
                        required
                        minLength={6}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        required
                        minLength={6}
                    />
                </div>

                <button type="submit" disabled={loading}>
                    {loading ? 'Resetting...' : 'Reset Password'}
                </button>

                <div className={styles.links}>
                    <Link to="/login">Back to Login</Link>
                </div>
            </form>
        </div>
    );
}
