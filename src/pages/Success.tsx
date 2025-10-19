import { useNavigate } from 'react-router-dom';
import styles from './Success.module.scss';

export function Success() {
  const navigate = useNavigate();

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