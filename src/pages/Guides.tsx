import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styles from './Guides.module.scss';

import guidesJSON from '../assets/guides/guides.json';
import GuideBack from '../components/GuideBack/GuideBack';
import { domain } from '../utils/other';

interface Guide {
    id: string;
    title: string;
    description: string;
    category: string;
    date: string;
    slug: string;
    readTime: string;
    thumbnailImage: string;
    thumbnailAlt: string;
}

// const guidesPath = "../assets/guides/guides.json";
function Guides() {
    const [guides, setGuides] = useState<Guide[]>([]);
    const [filteredGuides, setFilteredGuides] = useState<Guide[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const parsedGuides = JSON.parse(JSON.stringify(guidesJSON.guides));
        // Load guides from imported JSON
        setGuides(parsedGuides);
        setFilteredGuides(parsedGuides);
        setIsLoading(false);
    }, []);

    // useEffect(() => {
    //     // Load guides from JSON file
    //     setGuides(guides)
    //         .then(response => response.json())
    //         .then(data => {
    //             setGuides(data.guides);
    //             setFilteredGuides(data.guides);
    //             setIsLoading(false);
    //         })
    //         .catch(error => {
    //             console.error('Error loading guides:', error);
    //             setIsLoading(false);
    //         });
    // }, []);
    // console.log(guides);
    useEffect(() => {
        // Filter guides based on category and search query
        let filtered = guides;

        if (selectedCategory !== 'All') {
            filtered = filtered.filter(guide => guide.category === selectedCategory);
        }

        if (searchQuery) {
            filtered = filtered.filter(guide =>
                guide.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                guide.description.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }
        filtered = filtered.filter(guide => !!guide.title);
        console.log(filtered)
        setFilteredGuides(filtered);
    }, [selectedCategory, searchQuery, guides]);

    const categories = ['All', ...Array.from(new Set(guides.map(guide => guide.category)))];

    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
                <p>Loading guides...</p>
            </div>
        );
    }

    return (
        <>
            <title>Guides - PDF to Audio Converter | PDF to Audio</title>
            <meta name="title" content="Guides - PDF to Audio Converter | PDF to Audio" />
            <meta name="description" content="Comprehensive guides to help you master text-to-speech technology, document conversion, and accessible reading." />
            <meta name="keywords" content="PDF to audio guides, text to speech tutorials, document conversion tips, accessible reading resources" />

            {/* Open Graph / Facebook */}
            <meta property="og:type" content="website" />
            <meta property="og:url" content={`${domain}/guides`} />
            <meta property="og:title" content="Guides - PDF to Audio Converter | PDF to Audio" />
            <meta property="og:description" content="Comprehensive guides to help you master text-to-speech technology, document conversion, and accessible reading." />
            <meta property="og:image" content={`${domain}/l.png`} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />

            {/* Twitter */}
            <meta property="twitter:card" content="summary_large_image" />
            <meta property="twitter:url" content={`${domain}/guides`} />
            <meta property="twitter:title" content="Guides - PDF to Audio Converter | PDF to Audio" />
            <meta property="twitter:description" content="Comprehensive guides to help you master text-to-speech technology, document conversion, and accessible reading." />
            <meta property="twitter:image" content={`${domain}/l.png`} />

            {/* Canonical URL */}
            <link rel="canonical" href={`${domain}/guides`} />

            <div className={styles.guidesPage}>
                {/* Hero Section */}
                <section className={styles.hero}>
                    <GuideBack navigateTo="/dashboard" />
                    <div className={styles.heroContent}>

                        <h1 className={styles.heroTitle}>Guides</h1>
                        <p className={styles.heroDescription}>
                            Comprehensive guides to help you master text-to-speech technology,
                            document conversion, and accessible reading
                        </p>
                    </div>
                </section>

                {/* Search and Filter Section */}
                <section className={styles.filterSection}>

                    <div className={styles.container}>
                        <div className={styles.searchBar}>
                            <input
                                type="text"
                                placeholder="Search guides..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={styles.searchInput}
                            />
                            <svg className={styles.searchIcon} width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>

                        <div className={styles.categoryFilter}>
                            {categories.map(category => (
                                <button
                                    key={category}
                                    className={`${styles.categoryButton} ${selectedCategory === category ? styles.active : ''}`}
                                    onClick={() => setSelectedCategory(category)}
                                >
                                    {category}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Guides Grid */}
                <section className={styles.guidesSection}>
                    <div className={styles.container}>
                        {filteredGuides.length === 0 ? (
                            <div className={styles.noResults}>
                                <p>No guides found matching your criteria.</p>
                                <button
                                    className={styles.resetButton}
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedCategory('All');
                                    }}
                                >
                                    Reset Filters
                                </button>
                            </div>
                        ) : (
                            <div className={styles.guidesGrid}>
                                {filteredGuides.map(guide => (
                                    <Link
                                        key={guide.id}
                                        to={`/guides/${guide.slug}`}
                                        className={styles.guideCard}
                                    >
                                        <div className={styles.cardImage}>
                                            <img
                                                src={guide.thumbnailImage}
                                                alt={guide.thumbnailAlt}
                                                loading="lazy"
                                            />
                                            <span className={styles.categoryBadge}>{guide.category}</span>
                                        </div>
                                        <div className={styles.cardContent}>
                                            <h3 className={styles.cardTitle}>{guide.title}</h3>
                                            <p className={styles.cardDescription}>{guide.description}</p>
                                            <div className={styles.cardMeta}>
                                                <span className={styles.readTime}>
                                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                                                        <path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                    </svg>
                                                    {guide.readTime}
                                                </span>
                                                <span className={styles.date}>{new Date(guide.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                {/* CTA Section */}
                <section className={styles.ctaSection}>
                    <div className={styles.ctaContent}>
                        <h2>Ready to Get Started?</h2>
                        <p>Transform your documents into audio and experience the power of text-to-speech</p>
                        <Link to="/dashboard" className={styles.ctaButton}>
                            Try It Free
                        </Link>
                    </div>
                </section>
            </div>
        </>
    )
}

export default Guides;