import { GoogleLogin as GoogleLoginApi } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { instanceNoAuth } from '../../../utils/axiosInstance';
import styles from './GoogleLogin.module.scss';

const GoogleLogin = () => {
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);
    const [isErrorVisible, setIsErrorVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);



    // Handle error visibility with delay (matching LoginForm)
    useEffect(() => {
        let timeoutId: number;

        if (error) {
            timeoutId = window.setTimeout(() => {
                setIsErrorVisible(true);
            }, 300);
        } else {
            setIsErrorVisible(false);
        }

        return () => {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [error]);

    const handleGoogleSuccess = async (credentialResponse: any) => {
        setIsLoading(true);
        setError(null);
        setIsErrorVisible(false);
        const idToken = JSON.stringify({ idToken: credentialResponse.credential })
        try {
            const response = await instanceNoAuth.post('/auth/google-login', idToken);

            const data = await response.data;
            console.log(data)
            //   const data = await response.json();

            if (data.access_token) {
                localStorage.setItem('token', data.access_token);
                navigate('/dashboard');
                window.location.reload();

            } else {
                // Handle specific error messages from backend
                if (data.error) {
                    setError(data.error);
                } else if (data.userExists) {
                    setError(data.userExists);
                } else if (data.server) {
                    setError(data.server);
                } else {
                    setError('Login failed. Please try again.');
                }
            }
        } catch (err) {
            console.error('Google login error:', err);
            setError('Network error. Please check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleError = () => {
        setError('Google login failed. Please try again.');
    };

    return (
        <div>
            {error && (
                <div className={`${styles.error} ${isErrorVisible ? styles.visible : ''}`}>
                    {error}
                </div>
            )}

            <div className={styles.googleButtonWrapper}>
                <GoogleLoginApi
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    // width="50%"
                    theme="filled_black"      // "filled_blue" or "outline"
                    shape="pill"
                    size="large"
                    type="standard"
                    text="signup_with"
                    logo_alignment="left"

                // type="standard"    // "standard" or "popup"
                />
            </div>

            {isLoading && (
                <p className={styles.loading}>
                    Logging in with Google...
                </p>
            )}
        </div>
    );
};

export default GoogleLogin;