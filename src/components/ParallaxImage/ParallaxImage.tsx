import { useState, useEffect, useRef } from 'react';
import styles from './ParallaxImage.module.scss';

interface ParallaxImageProps {
    src: string;
    alt: string;
    containerClassName: string;
    imageClassName: string;
}

const ParallaxImage = ({ src, alt, containerClassName, imageClassName }: ParallaxImageProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const [transform, setTransform] = useState('translateY(0px)');

    useEffect(() => {
        const handleScroll = () => {
            if (containerRef.current && imageRef.current) {
                const containerRect = containerRef.current.getBoundingClientRect();
                const imageHeight = imageRef.current.offsetHeight;
                const containerHeight = containerRect.height;
                const windowHeight = window.innerHeight;

                // The amount of the image that is hidden
                const maxOffset = imageHeight - containerHeight;

                // Don't apply effect if image isn't taller than container
                if (maxOffset <= 0) {
                    return;
                }

                // Check if the container is in the viewport
                if (containerRect.top < windowHeight && containerRect.bottom > 0) {
                    // Calculate scroll progress (0 when container top enters viewport, 1 when it leaves)
                    const scrollProgress = (windowHeight - containerRect.top) / (windowHeight + containerHeight);
                    const clampedProgress = Math.max(0, Math.min(1, scrollProgress));

                    // Calculate the vertical offset to apply to the image
                    const offset = -clampedProgress * maxOffset;

                    setTransform(`translateY(${offset * 1.5}px)`);
                }
            }
        };

        const imgElement = imageRef.current;
        // Run calculation after image has loaded to get correct height
        if (imgElement?.complete) {
            handleScroll();
        } else if (imgElement) {
            imgElement.addEventListener('load', handleScroll);
        }

        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (imgElement) {
                imgElement.removeEventListener('load', handleScroll);
            }
        };
    }, [src]); // Rerun effect if image source changes

    return (
        <div ref={containerRef} className={containerClassName}>
            <img
                ref={imageRef}
                src={src}
                alt={alt}
                className={imageClassName}
                style={{ transform }}
            />
        </div>
    );

};

export default ParallaxImage;