import { useState } from 'react';
import styles from './Pricing.module.scss';
import { createCheckoutSession } from '../services/stripeService';
import { useNavigate } from 'react-router-dom';
import { SEO } from '../components/SEO/SEO';


export function Pricing() {
  const navigate = useNavigate();
  const [transferAmount, setTransferAmount] = useState<number>(100);
  const [inputValue, setInputValue] = useState<string>("100");
  const PRICE_PER_MB = 0.15;
  const [isLoading, setIsLoading] = useState(false);

  const calculatePrice = (mb: number): number => {
    return Number((mb * PRICE_PER_MB).toFixed(2));
  };

  const formatTransfer = (mb: number) => {
    if (mb >= 1000) {
      return `${(mb / 1000).toFixed(1)}GB`;
    }
    return `${mb}MB`;
  };

  const handlePurchase = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    try {
      setIsLoading(true);
      const amount = calculatePrice(transferAmount);
      const checkoutUrl = await createCheckoutSession({ amount, transferMb: transferAmount });
      window.open(checkoutUrl, '_blank');
    } catch (error) {
      console.error('Error initiating checkout:', error);
      // Here you might want to show an error message to the user
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <SEO
        title="Pricing - PDF to Audio Converter"
        description="Affordable PDF to audio conversion pricing. Pay only for what you use. $0.15 per MB. Convert documents to high-quality audio with AI voices."
        keywords="PDF to audio pricing, text to speech cost, audiobook pricing, TTS pricing, document conversion pricing"
        canonical="https://yourdomain.com/pricing"
      />
      <div className={styles.container}>
        <header className={styles.header}>
          <h1>Simple, Transparent Pricing</h1>
          <p>Choose the plan that's right for you</p>
        </header>

        <div className={styles.transferCalculator}>
          <h2>Calculate Your Transfer Needs</h2>
          <p className={styles.explanation}>
            Each file requires transfer equal to its size. For example, a 12MB PDF will use 12MB of transfer.
          </p>

          <div className={styles.sliderContainer}>
            <div className={styles.sliderHeader}>
              <span>Select Transfer Amount:</span>
              <div className={styles.inputGroup}>
                <input
                  type="number"
                  min="10"
                  max="2000"
                  value={inputValue}
                  onKeyDown={(e) => {
                    if (!/[\d\b]/.test(e.key) &&
                      !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    const value = e.target.value;
                    setInputValue(value);

                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue >= 10 && numValue <= 2000) {
                      setTransferAmount(numValue);
                    }
                  }}
                  onBlur={() => {
                    const numValue = Number(inputValue);
                    if (isNaN(numValue) || numValue < 10) {
                      setInputValue('10');
                      setTransferAmount(10);
                    } else if (numValue > 2000) {
                      setInputValue('2000');
                      setTransferAmount(2000);
                    } else {
                      const roundedValue = Math.floor(numValue);
                      setInputValue(roundedValue.toString());
                      setTransferAmount(roundedValue);
                    }
                  }}
                  className={styles.numberInput}
                />
                <span className={styles.unit}>MB</span>
              </div>
            </div>
            <input
              type="range"
              min="10"
              max="2000"
              value={transferAmount}
              onChange={(e) => {
                const value = Number(e.target.value);
                setTransferAmount(value);
                setInputValue(value.toString());
              }}
              className={styles.slider}
            />
            <div className={styles.sliderLabels}>
              <span>10MB</span>
              <span>2GB</span>
            </div>
          </div>

          <div className={styles.priceDisplay}>
            <div className={styles.priceBox}>
              <div className={styles.priceContent}>
                <span className={styles.priceAmount}>€{calculatePrice(transferAmount)}</span>
              </div>
              <button
                className={styles.buyButton}
                onClick={handlePurchase}
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : 'Purchase Now'}
              </button>
            </div>
          </div>
        </div>



      </div>
    </>
  );
} 