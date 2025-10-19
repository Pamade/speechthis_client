import { useNavigate } from 'react-router-dom';
import styles from './Cancel.module.scss';

export function Cancel() {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.icon}>❌</span>
          <h1>Transfer Cancelled</h1>
          <p>Your payment was cancelled and you have not been charged.</p>
        </div>
        <div className={styles.actions}>
          <button
            onClick={() => navigate('/dashboard')}
            className={styles.button}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
} 