import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './Profile.module.scss';
import toast from 'react-hot-toast';
import { instance } from '../utils/axiosInstance';
import { useUser } from '../context/UserContext';
import { Wallet, Music, BookOpen } from 'lucide-react';

interface AudioFile {
  audioCreatedAt: string;
  audioFileSizeMb: number;
  audioFormat: string;
  audioId: number;
  audioPublicId: string;
  audioSignedUrl: string;
  cloudinaryTextId: number;
  documentName: string;
  durationSeconds: number;
  filename: string;
  gender: string;
  language: string;
  textPublicId: string;
  textSignedUrl: string;
  textSize: number;
  uploadedAt: string;
  userFileId: number;
  voice: string;
}

interface ReadingFile {
  pdfId: number;
  publicId: string;
  signedUrl: string;
  fileSize: number;
  createdAt: string;
  fileName: string;
}

interface TransferHistory {
  date: string;
  type: 'Audio Conversion' | 'Reading Upload';
  fileName: string;
  transferUsed: number;
  details?: string;
}

export function Profile() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // New state for profile data
  const [currentTransfer, setCurrentTransfer] = useState<number>(0);
  const [fullTransferHistory, setFullTransferHistory] = useState<TransferHistory[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [totalFilesConverted, setTotalFilesConverted] = useState(0);
  const [totalReadingFiles, setTotalReadingFiles] = useState(0);

  const itemsPerPage = 3;
  const totalPages = Math.ceil(fullTransferHistory.length / itemsPerPage);
  const paginatedHistory = fullTransferHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getPaginationGroup = () => {
    const maxButtons = 3;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    let startPage = Math.max(1, currentPage - 1);
    let endPage = Math.min(totalPages, currentPage + 1);

    if (currentPage === 1) {
      endPage = 3;
    }

    if (currentPage === totalPages) {
      startPage = totalPages - 2;
    }

    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  // Fetch user's profile data and transfer history
  useEffect(() => {
    const fetchProfileData = async () => {
      setIsLoadingHistory(true);
      try {
        // Fetch current transfer balance
        const transferResponse = await instance.get<{ transfer: number }>('/available_transfer/get');
        setCurrentTransfer(transferResponse.data.transfer);

        // Fetch audio files for conversion history
        const audioResponse = await instance.get<AudioFile[]>('/files/with-urls-audio');
        const audioFiles = audioResponse.data || [];
        setTotalFilesConverted(audioFiles.length);

        // Fetch reading files for reading history
        const readingResponse = await instance.get<ReadingFile[]>('/files/pdfs');
        const readingFiles = readingResponse.data || [];
        setTotalReadingFiles(readingFiles.length);

        // Create transfer history from both sources
        const history: TransferHistory[] = [];

        // Add audio conversion history
        audioFiles.forEach(audio => {
          history.push({
            date: audio.audioCreatedAt,
            type: 'Audio Conversion',
            fileName: audio.documentName,
            transferUsed: audio.audioFileSizeMb, // Use audio file size in MB
            details: `${audio.voice} (${audio.language})`
          });
        });

        // Add reading file upload history (use actual file size)
        readingFiles.forEach(reading => {
          // console.log(reading)
          history.push({
            date: reading.createdAt,
            type: 'Reading Upload',
            fileName: reading.fileName,
            transferUsed: reading.fileSize + 1 / (1024 * 1024), // Convert bytes to MB
            details: 'PDF Document'
          });
        });

        // Sort by date (newest first)
        setFullTransferHistory(history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        1
      } catch (error: any) {
        console.error('Error fetching profile data:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchProfileData();
  }, [user]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    setPasswordError(null);

    // Basic validation
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordForm.currentPassword === passwordForm.newPassword) {
      setPasswordError('New password must be different from current password');
      return;
    }

    try {
      const response = await instance.patch('/auth-protected/change-password', null, {
        params: {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
          repeatPassword: passwordForm.confirmPassword
        }
      });

      if (response.data.message) {
        toast.success(response.data.message);
        setIsChangingPassword(false);
        // Clear the form and reset states
        setPasswordForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        setIsSubmitted(false);
        setPasswordError(null);
      }
    } catch (err: any) {
      console.error('Error changing password:', err.response?.data);
      if (err.response?.data?.error) {
        setPasswordError(err.response.data.error);
      } else {
        setPasswordError('Failed to change password. Please try again.');
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTransfer = (mb: number) => {
    return `${mb.toFixed(2)} MB`;
  };

  const getAccountAge = () => {
    if (!user?.createdAt) return 'Unknown';
    const created = new Date(user.createdAt);
    const now = new Date();
    const diffInMs = now.getTime() - created.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays < 30) {
      return `${diffInDays} days`;
    } else if (diffInDays < 365) {
      const months = Math.floor(diffInDays / 30);
      return `${months} month${months > 1 ? 's' : ''}`;
    } else {
      const years = Math.floor(diffInDays / 365);
      const remainingMonths = Math.floor((diffInDays % 365) / 30);
      return `${years} year${years > 1 ? 's' : ''}${remainingMonths > 0 ? `, ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}` : ''}`;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h1>Profile</h1>
          <Link to="/dashboard" className={styles.dashboardLink}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3,13H1V7H3V13M9,13H7V7H9V13M15,13H13V7H15V13M21,13H19V7H21V13M20,21H4V19H20V21M3,3H21V5H3V3Z" />
            </svg>
            Dashboard
          </Link>
        </div>
      </div>

      <div className={styles.profileContent}>
        {/* User Information Section */}
        <div className={styles.userSection}>
          {/* <div className={styles.userCard}>
            <div className={styles.userInfo}>
              <h2>{user?.email}</h2>
              <p>Account age: {getAccountAge()}</p>
            </div>
          </div> */}

          {/* Quick Stats */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon}><Wallet size={32} /></div>
              <div className={styles.statInfo}>
                <h3>{formatTransfer(currentTransfer)}</h3>
                <p>Available Transfer</p>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}><Music size={32} /></div>
              <div className={styles.statInfo}>
                <h3>{totalFilesConverted}</h3>
                <p>Audio Files</p>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}><BookOpen size={32} /></div>
              <div className={styles.statInfo}>
                <h3>{totalReadingFiles}</h3>
                <p>Reading Files</p>
              </div>
            </div>
          </div>
        </div>

        {/* Transfer History Section */}
        <div className={styles.historySection}>
          <h3>Transfer Usage History</h3>
          {isLoadingHistory ? (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner}></div>
              <p>Loading transfer history...</p>
            </div>
          ) : paginatedHistory.length > 0 ? (
            <>
              <div className={styles.historyList}>
                {paginatedHistory.map((item, index) => (
                  <div key={index} className={styles.historyItem}>
                    <div className={styles.historyIcon}>
                      {item.type === 'Audio Conversion' ? <Music size={24} /> : <BookOpen size={24} />}
                    </div>
                    <div className={styles.historyInfo}>
                      <h4>{item.fileName}</h4>
                      <p>{item.details}</p>
                      <span className={styles.historyDate}>{formatDate(item.date)}</span>
                    </div>
                    <div className={styles.historyTransfer}>
                      <span className={styles.transferAmount}>{formatTransfer(item.transferUsed)}</span>
                      <span className={styles.transferType}>{item.type}</span>
                    </div>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className={styles.paginationButton}
                  >
                    ‹
                  </button>
                  {getPaginationGroup().map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`${styles.paginationButton} ${pageNum === currentPage ? styles.active : ''}`}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className={styles.paginationButton}
                  >
                    ›
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className={styles.emptyHistory}>
              <p>No transfer history available.</p>
            </div>
          )}
        </div>

        {/* Account Settings Section */}
        <div className={styles.settingsSection}>
          <h3>Account Settings</h3>
          <div className={styles.settingCard}>
            <div className={styles.settingInfo}>
              <h4>Password</h4>
            </div>
            <button
              onClick={() => setIsChangingPassword(!isChangingPassword)}
              className={styles.settingButton}
            >
              {isChangingPassword ? 'Cancel' : 'Change Password'}
            </button>
          </div>

          {/* Password Change Form */}
          <div className={`${styles.passwordFormContainer} ${isChangingPassword ? styles.open : ''}`}>
            <div className={styles.passwordForm}>
              <h4>Change Password</h4>
              <form onSubmit={handlePasswordChange}>
                <div className={styles.inputGroup}>
                  <label htmlFor="currentPassword">Current Password</label>
                  <input
                    type="password"
                    id="currentPassword"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                    className={`${styles.input} ${isSubmitted && !passwordForm.currentPassword ? styles.error : ''}`}
                    required
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor="newPassword">New Password</label>
                  <input
                    type="password"
                    id="newPassword"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    className={`${styles.input} ${isSubmitted && passwordForm.newPassword.length < 6 ? styles.error : ''}`}
                    required
                    minLength={6}
                  />
                  <small>Minimum 6 characters</small>
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor="confirmPassword">Confirm New Password</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className={`${styles.input} ${isSubmitted && passwordForm.newPassword !== passwordForm.confirmPassword ? styles.error : ''}`}
                    required
                  />
                </div>

                {passwordError && (
                  <div className={styles.errorMessage}>
                    {passwordError}
                  </div>
                )}

                <div className={styles.formActions}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingPassword(false);
                      setPasswordForm({
                        currentPassword: '',
                        newPassword: '',
                        confirmPassword: ''
                      });
                      setPasswordError(null);
                      setIsSubmitted(false);
                    }}
                    className={styles.cancelButton}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.submitButton}
                    disabled={!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
                  >
                    Update Password
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}