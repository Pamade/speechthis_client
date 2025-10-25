import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './Navigation.module.scss';
import { useUser } from '../../context/UserContext';
import { useDownload } from '../../context/DownloadContext';
import toast from 'react-hot-toast';
import Logo from '../Logo/Logo';

export const Navigation = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useUser();
  const { downloadState, forceStopProcessing } = useDownload();

  const handleLogout = () => {
    if (downloadState.isProcessing) {
      const confirmed = window.confirm(
        "You have a file being processed. If you logout now, the process will be lost. Are you sure you want to logout?"
      );
      if (confirmed) {
        forceStopProcessing(); // Stop processing first
        toast.error('File processing has been cancelled due to logout', {
          duration: 4000,
          position: 'top-center',
        });
        logout();
      }
    } else {
      logout();
    }
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const content_logged_in = (
    <>
      <Link
        to="/guides"
        className={`${styles.menuItem} ${location.pathname === '/guides' ? styles.active : ''}`}
      >
        Guides
      </Link>
      <Link
        to="/profile"
        className={`${styles.menuItem} ${location.pathname === '/profile' ? styles.active : ''}`}
      >
        Profile
      </Link>
      <Link
        to="/pricing"
        className={`${styles.menuItem} ${location.pathname === '/pricing' ? styles.active : ''}`}
      >
        Pricing
      </Link>
      <Link
        to="/dashboard"
        className={`${styles.menuItem} ${location.pathname === '/dashboard' ? styles.active : ''}`}
      >
        Dashboard
      </Link>
      <Link
        onClick={handleLogout}
        to="/"
        className={`${styles.menuItem}`}
      >
        Logout
      </Link>
    </>
  )

  const content_logged_out = (
    <>
      <Link
        to="/guides"
        className={`${styles.menuItem} ${location.pathname === '/profile' ? styles.active : ''}`}
      >
        Guides
      </Link>
      <Link
        to="/pricing"
        className={`${styles.menuItem} ${location.pathname === '/pricing' ? styles.active : ''}`}
      >
        Pricing
      </Link>
      <Link
        to="/login"
        className={`${styles.menuItem} ${location.pathname === '/login' ? styles.active : ''}`}
      >
        Login
      </Link>
      <Link
        to="/register"
        className={`${styles.menuItem} ${location.pathname === '/register' ? styles.active : ''}`}
      >
        Register
      </Link>
    </>
  )

  return (

    <nav className={styles.nav}>

      <div className={styles.container}>
        <Logo />
        {/* <svg className={styles.logoImage}src xmlns="http://www.w3.org/2000/svg"></svg> */}

        <button
          className={styles.menuButton}
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={styles.menuIcon}
          >
            {isMenuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 8h16M4 12h16M4 16h16"
              />
            )}
          </svg>
        </button>

        <div className={`${styles.menuItems} ${isMenuOpen ? styles.open : ''}`}>
          {user ? content_logged_in : content_logged_out}
        </div>
      </div>
    </nav>
  );
}; 