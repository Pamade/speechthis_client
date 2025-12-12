# PDF to Audio Converter and Reader


**Live Demo:** [speechthis.com](https://speechthis.com)

A full-stack web application that converts PDF, DOCX, and EPUB documents using AI text-to-speech. Built as a solo project to provide an accessible, user-friendly solution for consuming written content through audio.

---

## Features

- **Multi-Format Support**: Convert PDF, DOCX, and EPUB files to audio
- **AI Voice Integration**: Azure and Google TTS engines with multiple voice options
- **Real-Time Text Highlighting**: Synchronized word-by-word highlighting during playback
- **Audio Downloads**: Export as MP3
- **Responsive Design**: Optimized experience across desktop, tablet, and mobile devices
- **Payment Integration**: Stripe-powered payment system
- **User Authentication**: Secure login and profile management
- **Educational Guides**: Content library with SEO-optimized articles

---

## Tech Stack

### Core
- **React 19**
- **TypeScript**
- **Vite**
- **SCSS Modules**

### Key Libraries
- **react-pdf** (`pdfjs-dist`) - PDF rendering and text extraction
- **mammoth** - DOCX document parsing
- **epubjs** - EPUB file processing
- **Stripe SDK** - Payment processing integration
- **Axios** - HTTP client for API communication

### State Management
- **React Context API** 
- **Custom Hooks**

---

## Project Architecture

### Directory Structure

```
src/
├── pages/           # Route components (Home, Dashboard, Pricing, Guides)
├── components/      # Reusable UI components (Navigation, AudioPlayer, PDFViewer)
├── utils/           # File processing utilities (PDF/DOCX/EPUB parsers)
├── customHooks/     # TTS integration and state management hooks
├── context/         # Global state providers (User, Downloads)
├── services/        # API integration (Stripe)
├── types/           # TypeScript interfaces and types
└── styles/          # Global styles and theme variables

public/
├── guides/          # Educational content and thumbnails
├── documents/       # Sample PDFs for demo
└── fonts/           # Custom web fonts
```

### Core Workflows

**Document Processing Pipeline:**
1. File upload → Format detection (PDF/DOCX/EPUB)
2. Text extraction using format-specific parsers
3. Text chunking for TTS API limits
4. Sequential TTS API calls with progress tracking
5. Audio blob assembly and MP3 conversion

**TTS Integration:**
- Azure Neural TTS: Premium voices with SSML support
- Google Cloud TTS: Multiple languages and voice variants
- Real-time audio generation with cancellation support
- Word-level timestamp extraction for synchronized highlighting

---

## Backend Integration

This frontend application communicates with a Java Spring Boot backend for:
- User authentication and authorization
- TTS API orchestration (Azure/Google)
- Payment processing via Stripe
- Document storage and retrieval

**Backend Repository:** [speechthis_server](https://github.com/Pamade/speechthis_server)

---

## Role & Responsibilities

**Solo Full-Stack Development** - Complete ownership of:
- Frontend architecture and UI/UX design
- File processing and TTS integration logic
- Responsive design implementation
- Performance optimization (lazy loading, code splitting)
- SEO strategy and content creation
- Backend API design and implementation
- Database schema and deployment infrastructure
