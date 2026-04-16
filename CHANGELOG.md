# Changelog

## 2026-04-08

### HEIC Image Format Support

- Added HEIC/HEIF format support with automatic JPEG conversion (90% quality)
- Browser-based conversion using heic2any library
- Error handling for conversion failures

### Logo Sizing & Image Quality

- Logo size now scales per image (based on smaller dimension)
- Adaptive padding prevents logo cropping
- Lossless PNG output, maximum quality JPEG/WebP (1.0)
- Output filenames preserve original format extensions

## 2025-08-28

### Interactive Preview & Text Effects

- Click any uploaded image to set as live preview
- Advanced text effects: shadow, outline, glow with full customization
- Mobile upload improvements with camera integration

### UI Reorganization

- Separate control sections for text and logo modes
- Cleaner interface with context-relevant controls

### Performance & Polish

- Automatic dark/light mode detection
- Improved drag-and-drop with click fallback
- Optimized rendering with intelligent caching

### Gallery & Core Features

- Gallery modal with checkbox selection
- Tiled watermark patterns with smart spacing
- Multi-format support (JPEG, PNG, GIF, WebP)
