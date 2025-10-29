import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './Success.module.scss';
import { useEffect } from 'react';
import { instance } from '../utils/axiosInstance';

export function Success() {
  const navigate = useNavigate();
  const [params, setSessionID] = useSearchParams("session_id")
  const token = localStorage.getItem('token');

  useEffect(() => {

    const sessionId = params.get('session_id');

    const verifySession = async () => {
      try {

        const res = await instance.get(`/stripe/verify-session/${sessionId}`)
        // alert(res)
        console.log(res)
        if (res.data.success) {
          // if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
          //   window.gtag('event', 'conversion', {
          //     'send_to': 'AW-17674261329/B5P0CK-2-bIbENGm3-tB',
          //     'value': res.data.amount,
          //     'currency': 'EUR',
          //     'transaction_id': sessionId
          //   });
          // }

        }
      } catch (error) {
        console.log(error)
        // alert(error)
      }

    }
    if (sessionId && token) {
      verifySession()
    }


  }, [params, token])

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.icon}>✅</span>
          <h1>Transfer Successful!</h1>
          <p>Thank you for your purchase. Your transfer has been added to your account.</p>
        </div>
        <div className={styles.actions}>
          <button
            onClick={() => navigate('/dashboard')}
            className={styles.button}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
} 