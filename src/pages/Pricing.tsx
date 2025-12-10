import { useState } from 'react';
import styles from './Pricing.module.scss';
import { createCheckoutSession } from '../services/stripeService';
import { useNavigate } from 'react-router-dom';
import { domain } from '../utils/other';
import { Mic, FileText, Download, Lock, RefreshCw, Wallet } from 'lucide-react';


export function Pricing() {
  const navigate = useNavigate();
  const [transferAmount, setTransferAmount] = useState<number>(7);
  const [inputValue, setInputValue] = useState<string>("7");
  const PRICE_PER_MB = 0.15;
  const MIN_MB = 7;
  const MAX_MB = 2000;
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
      {/* React 19 Native Metadata */}
      <title>Pricing - PDF to Audio Converter | PDF to Audio</title>
      <meta name="title" content="Pricing - PDF to Audio Converter | PDF to Audio" />
      <meta name="description" content="Affordable PDF to audio conversion pricing. Pay only for what you use. $0.15 per MB. Convert documents to high-quality audio with AI voices." />
      <meta name="keywords" content="PDF to audio pricing, text to speech cost, audiobook pricing, TTS pricing, document conversion pricing" />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={`${domain}/pricing`} />
      <meta property="og:title" content="Pricing - PDF to Audio Converter | PDF to Audio" />
      <meta property="og:description" content="Affordable PDF to audio conversion pricing. Pay only for what you use. $0.15 per MB. Convert documents to high-quality audio with AI voices." />
      <meta property="og:image" content={`${domain}/l.png`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={`${domain}/pricing`} />
      <meta property="twitter:title" content="Pricing - PDF to Audio Converter | PDF to Audio" />
      <meta property="twitter:description" content="Affordable PDF to audio conversion pricing. Pay only for what you use. $0.15 per MB. Convert documents to high-quality audio with AI voices." />
      <meta property="twitter:image" content={`${domain}/l.png`} />

      {/* Canonical URL */}
      <link rel="canonical" href={`${domain}/pricing`} />

      <div className={styles.container}>
        <header className={styles.header}>
          <h1>Simple, Transparent Pricing</h1>
          <p>Pay as you go. No subscriptions, no hidden fees.</p>
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
                  min={MIN_MB}
                  max={MAX_MB}
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
                    if (!isNaN(numValue) && numValue >= MIN_MB && numValue <= MAX_MB) {
                      setTransferAmount(numValue);
                    }
                  }}
                  onBlur={() => {
                    const numValue = Number(inputValue);
                    if (isNaN(numValue) || numValue < MIN_MB) {
                      setInputValue(MIN_MB.toString());
                      setTransferAmount(MIN_MB);
                    } else if (numValue > MAX_MB) {
                      setInputValue(MAX_MB.toString());
                      setTransferAmount(MAX_MB);
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
              min={MIN_MB}
              max={MAX_MB}
              value={transferAmount}
              onChange={(e) => {
                const value = Number(e.target.value);
                setTransferAmount(value);
                setInputValue(value.toString());
              }}
              className={styles.slider}
            />
            <div className={styles.sliderLabels}>
              <span>{MIN_MB}MB</span>
              <span>{MAX_MB / 1000}GB</span>
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

        {/* What's Included Section */}
        <section className={styles.featuresSection}>
          <h2 className={styles.sectionTitle}>What's Included</h2>
          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}><Mic size={32} /></div>
              <h3>High-Quality AI Voices</h3>
              <p>Access to premium text-to-speech voices from Google and Azure.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}><FileText size={32} /></div>
              <h3>Large File Support</h3>
              <p>Convert large documents, books, and articles up to 2GB.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}><Download size={32} /></div>
              <h3>Downloadable MP3s</h3>
              <p>Get high-quality MP3 audio files to listen anywhere, anytime.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}><Lock size={32} /></div>
              <h3>Secure & Private</h3>
              <p>Your files are processed securely and never stored on our servers.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}><RefreshCw size={32} /></div>
              <h3>No Subscriptions</h3>
              <p>Make a one-time purchase for the transfer you need. No recurring bills.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}><Wallet size={32} /></div>
              <h3>Pay For What You Use</h3>
              <p>Your transfer is only used when you convert a file. It never expires.</p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className={styles.faqSection}>
          <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
          <div className={styles.faqContainer}>
            <div className={styles.faqItem}>
              <h3>What am I paying for?</h3>
              <p>You are purchasing "transfer" credit, which is used to convert your PDF documents into audio. The amount of transfer required is equal to the size of your file. For example, converting a 10MB PDF will use 10MB of your transfer credit.</p>
            </div>
            <div className={styles.faqItem}>
              <h3>Is this a one-time payment?</h3>
              <p>Yes, all purchases are one-time payments. We do not offer subscriptions. You can buy more transfer credit whenever you need it.</p>
            </div>
            <div className={styles.faqItem}>
              <h3>What payment methods do you accept?</h3>
              <p>We accept all major credit cards, including Visa, Mastercard, and American Express, processed securely through Stripe.</p>
            </div>
            <div className={styles.faqItem}>
              <h3>Does my transfer expire?</h3>
              <p>No, your purchased transfer credit never expires. You can use it whenever you need to convert a document.</p>
            </div>
            <div className={styles.faqItem}>
              <h3>Can I get a refund?</h3>
              <p>Due to the nature of digital services, we generally do not offer refunds. However, if you experience a technical issue with a conversion, please contact our support, and we will be happy to assist you and provide a transfer credit refund if necessary.</p>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}