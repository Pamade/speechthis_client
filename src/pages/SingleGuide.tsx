
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import guidesData from '../assets/guides/guides.json';
import styles from './SingleGuide.module.scss';
import ParallaxImage from '../components/ParallaxImage/ParallaxImage';
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
    sections: Section[];
    relatedGuides: string[];
    callToAction: {
        text: string;
        buttonText: string;
        buttonLink: string;
    };
}

interface Section {
    heading?: string;
    subheading?: string;
    content?: string;
    type: string;
    items?: any[];
    image?: string;
    imageAlt?: string;
}

const SingleGuide = () => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const [guide, setGuide] = useState<Guide | null>(null);

    useEffect(() => {
        const foundGuide = guidesData.guides.find((g) => g.slug === slug);
        if (foundGuide && foundGuide.title) {
            setGuide(foundGuide as Guide);
            window.scrollTo(0, 0);
        }
    }, [slug]);

    if (!guide) {
        return (
            <div className={styles.notFound}>
                <h1>Guide Not Found</h1>
                <button onClick={() => navigate('/guides')} className={styles.backButton}>
                    ← Back to Guides
                </button>
            </div>
        );
    }

    const relatedGuidesData = guidesData.guides.filter((g) =>
        g.slug && guide.relatedGuides.includes(g.slug)
    );

    const renderSection = (section: Section, index: number) => {
        if (!section) return null;
        return (
            <div key={index} className={styles.section}>
                {section.heading && <h2>{section.heading}</h2>}
                {section.subheading && <h3>{section.subheading}</h3>}

                {section.image && (
                    <ParallaxImage
                        src={section.image}
                        alt={section.imageAlt!}
                        containerClassName={styles.sectionImageContainer}
                        imageClassName={styles.sectionImage}
                    />
                )}

                {section.content && <p>{section.content}</p>}

                {section.type === 'list' && section.items && (
                    <ul className={styles.list}>
                        {section.items.map((item: any, i: number) => (
                            <li key={i}>
                                {typeof item === 'string' ? (
                                    item
                                ) : (
                                    <>
                                        <strong>{item.title}:</strong> {item.description}
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {section.type === 'ordered-list' && section.items && (
                    <ol className={styles.orderedList}>
                        {section.items.map((item: any, i: number) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ol>
                )}
            </div>
        );
    };

    return (
        <>

            <title>{guide.title} - PDF to Audio Converter | PDF to Audio</title>
            <meta name="title" content={`${guide.title} - PDF to Audio Converter | PDF to Audio`} />
            <meta name="description" content="Comprehensive guides to help you master text-to-speech technology, document conversion, and accessible reading." />
            <meta name="keywords" content="PDF to audio guides, text to speech tutorials, document conversion tips, accessible reading resources" />

            {/* Open Graph / Facebook */}
            <meta property="og:type" content="website" />
            <meta property="og:url" content={`${domain}/guides/${guide.slug}`} />
            <meta property="og:title" content={`${guide.title} - PDF to Audio Converter | PDF to Audio`} />
            <meta property="og:description" content="Comprehensive guides to help you master text-to-speech technology, document conversion, and accessible reading." />
            <meta property="og:image" content={`${domain}/l.png`} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />

            {/* Twitter */}
            <meta property="twitter:card" content="summary_large_image" />
            <meta property="twitter:url" content={`${domain}/guides/${guide.slug}`} />
            <meta property="twitter:title" content={`${guide.title} - PDF to Audio Converter | PDF to Audio`} />
            <meta property="twitter:description" content="Comprehensive guides to help you master text-to-speech technology, document conversion, and accessible reading." />
            <meta property="twitter:image" content={`${domain}/l.png`} />

            {/* Canonical URL */}
            <link rel="canonical" href={`${domain}/guides/${guide.slug}`} />

            <div className={styles.singleGuide}>


                <article className={styles.article}>

                    <header className={styles.header}>
                        <GuideBack navigateTo="/guides" />
                        <div className={styles.meta}>
                            <span className={styles.category}>{guide.category}</span>
                            <span className={styles.date}>{new Date(guide.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                            <span className={styles.readTime}>{guide.readTime}</span>
                        </div>

                        <h1 className={styles.title}>{guide.title}</h1>
                        <p className={styles.description}>{guide.description}</p>

                        <img
                            src={guide.thumbnailImage}
                            alt={guide.thumbnailAlt}
                            className={styles.heroImage}
                        />
                    </header>

                    <div className={styles.content}>
                        {guide.sections.map((section, index) => section.content && renderSection(section, index))}
                    </div>

                    {guide.callToAction && (
                        <div className={styles.cta}>
                            <h2>{guide.callToAction.text}</h2>
                            <Link to={guide.callToAction.buttonLink} className={styles.ctaButton}>
                                {guide.callToAction.buttonText}
                            </Link>
                        </div>
                    )}

                    {relatedGuidesData.length > 0 && (
                        <div className={styles.relatedGuides}>
                            <h2>Related Guides</h2>
                            <div className={styles.relatedGrid}>
                                {relatedGuidesData.map((relatedGuide: any) => (
                                    relatedGuide.title && relatedGuide.slug && (
                                        <Link
                                            key={relatedGuide.id}
                                            to={`/guides/${relatedGuide.slug}`}
                                            className={styles.relatedCard}
                                        >
                                            <img src={relatedGuide.thumbnailImage} alt={relatedGuide.thumbnailAlt} />
                                            <h3>{relatedGuide.title}</h3>
                                            <p>{relatedGuide.description}</p>
                                        </Link>
                                    )
                                ))}
                            </div>
                        </div>
                    )}
                </article>
            </div>
        </>
    );
};

export default SingleGuide;