import styles from './Footer.module.scss';
import { Link } from 'react-router-dom';
import Logo from '../Logo/Logo';
const Footer = () => {
    return (
        <footer className={styles.footer}>
            <div className={styles.footerContent}>
                <Logo />
                <nav className={styles.footerNav}>
                    <Link to="/">Home</Link>
                    <Link to="/pricing">Pricing</Link>
                    <Link to="/dashboard">Dashboard</Link>
                    <Link to="/login">Login</Link><Link to="/register">Register</Link>
                </nav>
                {/* <div className={styles.legal}>
                    <Link to="/privacy">Privacy Policy</Link>
                    <Link to="/terms">Terms of Service</Link>
                </div> */}
                <div className={styles.contact}>
                    <span>Contact: </span>
                    <a href="mailto:info@speechthis.com">info@speechthis.com</a>
                </div>
                <small>© 2025 SPEECHTHIS. All rights reserved.</small>
            </div>
        </footer>
    )
}

export default Footer;