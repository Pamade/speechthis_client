import { useNavigate } from 'react-router-dom';
import styles from './GuideBack.module.scss';
function GuideBack({ navigateTo }: { navigateTo: string }) {
    const navigate = useNavigate();
    return (
        <button onClick={() => navigate(navigateTo)} className={styles.backButton}>
            <div className={styles.arrow}>
                ←
            </div>
        </button>
    );
}

export default GuideBack;