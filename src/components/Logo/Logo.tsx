import { Link } from "react-router-dom"
import styles from "./Logo.module.scss"
const Logo = () => {
    return (
        <Link to="/" className={styles.logo}>
            <span className={styles.logoText}>
                <span className={styles.logoSpeech}>SPEECH</span>
                <span className={styles.logoThis}>THIS</span>
            </span>
        </Link>
    )
}
export default Logo;