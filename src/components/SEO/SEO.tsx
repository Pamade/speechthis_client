import { Helmet } from 'react-helmet-async';
import { domain } from '../../utils/other';
interface SEOProps {
    title?: string;
    description?: string;
    keywords?: string;
    ogImage?: string;
    canonical?: string;
    noindex?: boolean;
}

export const SEO = ({
    title = 'PDF to Audio - Convert Books to Speech with AI Voices',
    description = 'Transform your PDF documents into high-quality audio with AI-powered text-to-speech. Listen to books, articles, and documents on the go with natural-sounding voices.',
    keywords = 'PDF to audio, text to speech, PDF reader, audiobook converter, AI voice, read aloud',
    ogImage = domain + "/l.png",
    canonical,
    noindex = false,
}: SEOProps) => {
    const fullTitle = title.includes('|') ? title : `${title} | PDF to Audio`;
    const siteUrl = domain;
    const url = canonical || (typeof window !== 'undefined' ? window.location.href : siteUrl);
    const fullOgImage = ogImage.startsWith('http') ? ogImage : `${siteUrl}${ogImage}`;

    return (
        <Helmet>
            {/* Primary Meta Tags */}
            <title>{fullTitle}</title>
            <meta name="title" content={fullTitle} />
            <meta name="description" content={description} />
            <meta name="keywords" content={keywords} />
            {noindex && <meta name="robots" content="noindex, nofollow" />}

            {/* Open Graph / Facebook */}
            <meta property="og:type" content="website" />
            <meta property="og:url" content={url} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={fullOgImage} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />

            {/* Twitter */}
            <meta property="twitter:card" content="summary_large_image" />
            <meta property="twitter:url" content={url} />
            <meta property="twitter:title" content={fullTitle} />
            <meta property="twitter:description" content={description} />
            <meta property="twitter:image" content={fullOgImage} />

            {/* Canonical URL */}
            {canonical && <link rel="canonical" href={canonical} />}
        </Helmet>
    );
};
