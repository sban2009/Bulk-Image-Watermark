/*
 * BULK IMAGE WATERMARK TOOL
 * ========================
 *
 * A comprehensive JavaScript application for adding watermarks to multiple images
 * with advanced pattern layouts, real-time preview, and batch processing capabilities.
 *
 * ARCHITECTURE OVERVIEW:
 * ---------------------
 *
 * 1. FILE MANAGEMENT:
 *    - FileUploadHandler: Manages drag-drop, file validation, and preview generation
 *    - ProcessedImageModal: Handles processed image gallery and selection
 *    - BulkWatermarkApp: Core application orchestrating all components
 *
 * 2. WATERMARK RENDERING PIPELINE:
 *    - Dual-mode support: Text watermarks with effects, Logo/image watermarks
 *    - Pattern layouts: Single placement, diagonal grids, orthogonal grids
 *    - Performance optimization: Intelligent caching system for repeated operations
 *    - Real-time preview: Immediate feedback for all setting changes
 *
 * 3. SPACING SYSTEM (Key Innovation):
 *    - User-friendly 0-20 scale for intuitive control
 *    - Independent X/Y axis spacing for rectangular watermarks
 *    - Smart conversion to pixel-perfect center-to-center distances
 *    - Overlap prevention with guaranteed minimum gaps
 *
 * 4. PERFORMANCE OPTIMIZATIONS:
 *    - Watermark caching: Pre-renders watermarks to offscreen canvas
 *    - Quantized cache keys: Enables reuse across similar image sizes
 *    - Viewport culling: Only renders visible tiles in patterns
 *    - Sequential processing: Prevents memory exhaustion in batch operations
 *
 * 5. USER EXPERIENCE:
 *    - Separate control containers for text vs logo modes
 *    - Real-time synchronization between sliders, inputs, and displays
 *    - Progress tracking with visual feedback
 *    - Responsive design with dark/light theme support
 *
 * KEY ALGORITHMS:
 * --------------
 *
 * SPACING CALCULATION (convertSpacingToPixels):
 * - Input: UI value 0-20, watermark dimensions, canvas scale
 * - Output: Center-to-center pixel distance
 * - Logic: Value 0 = touching, values 1-20 = progressive gaps with guaranteed minimums
 *
 * PATTERN RENDERING (applyTiledPattern):
 * - Diagonal mode: Projects independent X/Y spacing onto rotated coordinate system
 * - Grid mode: Regular orthogonal layout with half-spacing centering offset
 * - Performance: Bounds checking and tile counting to prevent infinite loops
 *
 * CACHE MANAGEMENT (buildWatermarkCache):
 * - Comprehensive hash keys including all visual settings
 * - Quantized dimensions for improved cache hit rates
 * - Padding calculations for visual effects (shadows, glows)
 * - Automatic cache invalidation when settings change
 *
 * REFACTORING OPPORTUNITIES:
 * -------------------------
 * 1. Extract spacing logic into separate class for better testability
 * 2. Implement async processing with Web Workers for large batches
 * 3. Add more sophisticated error handling with user notifications
 * 4. Consider WebGL acceleration for pattern rendering
 * 5. Implement undo/redo system for setting changes
 */

/* THEME MANAGEMENT: Dark/Light Mode Switcher */
document.addEventListener("DOMContentLoaded", function () {
	const themeBtn = document.getElementById("themeSwitcher");
	if (!themeBtn) return;

	/**
	 * Apply theme to document with proper CSS custom properties.
	 * @param {boolean} dark - Whether to apply dark theme
	 */
	function setTheme(dark) {
		document.documentElement.setAttribute("data-color-scheme", dark ? "dark" : "light");
		document.body.classList.toggle("dark-mode", dark);
		themeBtn.textContent = dark ? "🌖 Light Mode" : "🌒 Dark Mode";
	}

	/*
	 * THEME INITIALIZATION: Detect user's preferred color scheme.
	 * Falls back to dark mode if preference cannot be determined.
	 */
	let isDark = true;
	try {
		const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
		const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
		isDark = prefersDark || !prefersLight;
	} catch (err) {
		isDark = true; // Default to dark mode on error
	}

	setTheme(isDark);
	themeBtn.addEventListener("click", function () {
		isDark = !isDark;
		setTheme(isDark);
	});
});

/**
 * FILE UPLOAD HANDLER
 * ===================
 *
 * Manages file selection, validation, and preview generation.
 * Supports drag-and-drop interface and standard file input.
 *
 * FEATURES:
 * - Format validation (JPEG, PNG, GIF, WebP)
 * - Preview image generation with proper scaling
 * - Error handling for unsupported files
 * - Integration with main application file management
 */
class FileUploadHandler {
	constructor() {
		// Supported image formats for validation
		this.supportedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
		this.maxFileSize = 10485760; /* 10MB */
		this.uploadArea = null;
		this.fileInput = null;
		this.isInitialized = false;
		this.init();
	}

	setupFileInputClick() {
		if (!this.uploadArea || !this.fileInput) {
			console.error("Elements not found for file input click setup");
			return;
		}

		/* Handle label clicks for better accessibility */
		const label = document.querySelector(`label[for="${this.fileInput.id}"]`);
		if (label) {
			label.addEventListener("click", () => {
				this.fileInput.value = "";
				try {
					this.fileInput.click();
				} catch (err) {
					console.error("Label click failed to open file chooser", err);
				}
			});
		}

		/* Direct upload area click handler */
		this.uploadArea.addEventListener("click", (e) => {
			if (this.uploadArea.classList.contains("processing")) return;

			this.fileInput.value = "";
			try {
				this.fileInput.click();
			} catch (error) {
				console.error("File input click failed:", error);
				this.showError("Unable to open file chooser. Please try drag and drop instead.");
			}
		});

		this.uploadArea.style.cursor = "pointer";
	}

	triggerFileInput() {
		if (!this.fileInput) return;
		this.fileInput.value = "";
		this.fileInput.click();
	}

	handleFileSelect(e) {
		const files = e.target.files;
		if (!files || files.length === 0) return;
		this.processFiles(Array.from(files));
	}

	processFiles(files) {
		if (!files || files.length === 0) {
			this.showError("No files to process");
			return;
		}

		const validFiles = [];
		const errors = [];

		files.forEach((file) => {
			const validation = this.validateFile(file);
			if (validation.isValid) {
				validFiles.push(file);
			} else {
				errors.push(`${file.name}: ${validation.error}`);
			}
		});

		if (errors.length > 0) {
			this.showError(`File validation errors:\n${errors.join("\n")}`);
		}

		if (validFiles.length > 0) {
			this.showStatus(`Processing ${validFiles.length} valid files...`);
			if (window.watermarkApp) {
				window.watermarkApp.addFiles(validFiles);
			}
		}
	}

	validateFile(file) {
		if (!file) return { isValid: false, error: "Invalid file" };

		if (!this.supportedTypes.includes(file.type.toLowerCase())) {
			return { isValid: false, error: `Unsupported type: ${file.type}` };
		}

		if (file.size > this.maxFileSize) {
			const sizeMB = (file.size / 1048576).toFixed(2);
			return { isValid: false, error: `Too large: ${sizeMB}MB (max: 10MB)` };
		}

		if (file.size < 100) {
			return { isValid: false, error: "File appears empty" };
		}

		return { isValid: true };
	}

	showStatus(message) {
		const statusEl = document.getElementById("uploadStatus");
		if (statusEl) {
			statusEl.textContent = message;
			statusEl.className = "upload-status";
		}
	}

	showError(message) {
		const errorContainer = document.getElementById("errorContainer");
		const errorMessage = document.getElementById("errorMessage");

		if (errorContainer && errorMessage) {
			errorMessage.textContent = message;
			errorContainer.classList.remove("hidden");

			setTimeout(() => {
				errorContainer.classList.add("hidden");
			}, 5000);
		}

		console.error("Error:", message);
	}

	clearStatus() {
		const statusEl = document.getElementById("uploadStatus");
		if (statusEl) {
			statusEl.textContent = "";
		}
	}
	// Call drag and drop setup after DOM is ready
	init() {
		// Wait for DOM to be fully loaded
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", () => this.setupElements());
		} else {
			this.setupElements();
		}
	}

	setupElements() {
		this.uploadArea = document.getElementById("uploadArea");
		this.fileInput = document.getElementById("fileInput");
		if (!this.uploadArea || !this.fileInput) {
			console.error("Required elements not found");
			return;
		}

		/* Ensure uploadArea is positioned for absolute children */
		if (getComputedStyle(this.uploadArea).position === "static") {
			this.uploadArea.style.position = "relative";
		}

		this.setupFileInputClick();
		this.setupDragAndDrop();
		this.fileInput.addEventListener("change", (e) => this.handleFileSelect(e));
		this.isInitialized = true;
		this.showStatus("Ready to upload images - Click here or drag files");
	}

	/**
	 * Setup drag and drop listeners for uploadArea and prevent native document drop behavior.
	 */
	setupDragAndDrop() {
		if (!this.uploadArea) return;

		// Prevent the browser from opening files when dropped outside the upload area
		document.addEventListener("dragover", (e) => e.preventDefault());
		document.addEventListener("drop", (e) => e.preventDefault());

		// Visual feedback on drag
		this.uploadArea.addEventListener("dragenter", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.uploadArea.classList.add("drag-over");
		});

		this.uploadArea.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.stopPropagation();
			// show visual state
			this.uploadArea.classList.add("drag-over");
		});

		this.uploadArea.addEventListener("dragleave", (e) => {
			e.preventDefault();
			e.stopPropagation();
			/* Only remove when leaving the upload area */
			if (!e.relatedTarget || !this.uploadArea.contains(e.relatedTarget)) {
				this.uploadArea.classList.remove("drag-over");
			}
		});

		this.uploadArea.addEventListener("drop", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.uploadArea.classList.remove("drag-over");
			const dt = e.dataTransfer;
			if (!dt) return;
			const files = dt.files;
			if (files && files.length > 0) {
				this.processFiles(Array.from(files));
			}
		});
	}
}

class ProcessedImageModal {
	constructor() {
		this.modal = null;
		this.imageViewer = null;
		this.processedImages = [];
		this.init();
	}

	init() {
		this.modal = document.getElementById("galleryModal");
		this.imageViewer = document.getElementById("imageViewer");
		this.bindEvents();
	}

	bindEvents() {
		// Modal close events
		const closeButtons = [
			document.getElementById("modalCloseBtn"),
			document.getElementById("modalCloseBtn2"),
			document.getElementById("modalOverlay"),
		];

		closeButtons.forEach((btn) => {
			if (btn) {
				btn.addEventListener("click", () => this.closeModal());
			}
		});

		// Download all button in modal
		const modalDownloadBtn = document.getElementById("modalDownloadAllBtn");
		if (modalDownloadBtn) {
			modalDownloadBtn.addEventListener("click", () => this.downloadAllAsZip());
		}

		// Image viewer close
		const viewerCloseButtons = [
			document.getElementById("imageViewerClose"),
			document.getElementById("imageViewerOverlay"),
		];

		viewerCloseButtons.forEach((btn) => {
			if (btn) {
				btn.addEventListener("click", () => this.closeImageViewer());
			}
		});

		// Keyboard navigation
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				if (this.imageViewer && !this.imageViewer.classList.contains("hidden")) {
					this.closeImageViewer();
				} else if (this.modal && this.modal.classList.contains("show")) {
					this.closeModal();
				}
			}
		});
	}

	showModal(processedImages) {
		this.processedImages = processedImages;
		this.populateGallery();

		if (this.modal) {
			// Ensure modal is visible even if markup starts with a `hidden` helper class
			this.modal.classList.remove("hidden");
			this.modal.classList.add("show");
			document.body.style.overflow = "hidden";

			const countEl = document.getElementById("galleryCount");
			if (countEl) {
				countEl.textContent = `${processedImages.length} images processed`;
			}

			// focus the modal for accessibility
			try {
				const firstFocusable = this.modal.querySelector(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
				);
				if (firstFocusable) firstFocusable.focus();
			} catch (e) {
				// ignore
			}
		}
	}

	populateGallery() {
		const galleryGrid = document.getElementById("galleryGrid");
		if (!galleryGrid) return;

		// Clear previous content and any existing toolbar to avoid duplicates
		const existingToolbar = galleryGrid.parentNode.querySelector(".gallery-toolbar");
		if (existingToolbar) existingToolbar.remove();
		galleryGrid.innerHTML = "";

		if (!this.processedImages || this.processedImages.length === 0) {
			// Show an empty state card
			const empty = document.createElement("div");
			empty.className = "empty-state";
			empty.innerHTML = `<div style="padding:24px; text-align:center;"><h3>No processed images</h3><p>Click "Process All Images" to generate the gallery.</p></div>`;
			galleryGrid.appendChild(empty);
			return;
		}

		// Add a small toolbar with select-all checkbox and download selected
		const toolbar = document.createElement("div");
		toolbar.className = "gallery-toolbar";
		toolbar.innerHTML = `
				<label><input type="checkbox" id="selectAllImages" checked> Select All</label>
				<button id="downloadSelectedBtn" class="btn btn--primary btn--sm">Download Selected</button>
			`;
		galleryGrid.parentNode.insertBefore(toolbar, galleryGrid);

		this.processedImages.forEach((imageData, index) => {
			const galleryItem = document.createElement("div");
			galleryItem.className = "gallery-item";

			galleryItem.innerHTML = `
				<label class="gallery-select"><input type="checkbox" class="image-select" data-idx="${index}" checked></label>
				<img src="${imageData.url}" alt="${imageData.name}">
				<div class="gallery-info">
					<span class="filename">${imageData.name}</span>
					<button class="btn btn--primary btn--sm download-btn">Download</button>
				</div>
			`;

			// Click to view full size
			const img = galleryItem.querySelector("img");
			if (img) {
				img.addEventListener("click", () => this.showImageViewer(imageData));
			}

			// Download individual image
			const downloadBtn = galleryItem.querySelector(".download-btn");
			if (downloadBtn) {
				downloadBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					this.downloadImage(imageData);
				});
			}

			galleryGrid.appendChild(galleryItem);
		});

		// Wire toolbar controls
		const selectAll = document.getElementById("selectAllImages");
		const downloadSelectedBtn = document.getElementById("downloadSelectedBtn");

		if (selectAll) {
			selectAll.addEventListener("change", (e) => {
				document.querySelectorAll(".image-select").forEach((cb) => {
					cb.checked = selectAll.checked;
				});
			});
		}

		if (downloadSelectedBtn) {
			downloadSelectedBtn.addEventListener("click", () => this.downloadSelectedAsZip());
		}
	}

	showImageViewer(imageData) {
		if (!this.imageViewer) return;

		const img = document.getElementById("imageViewerImg");
		const name = document.getElementById("imageViewerName");
		const downloadBtn = document.getElementById("imageViewerDownload");

		if (img) img.src = imageData.url;
		if (name) name.textContent = imageData.name;

		if (downloadBtn) {
			downloadBtn.onclick = () => this.downloadImage(imageData);
		}

		this.imageViewer.classList.remove("hidden");
		this.imageViewer.classList.add("show");
	}

	closeImageViewer() {
		if (this.imageViewer) {
			this.imageViewer.classList.remove("show");
			setTimeout(() => {
				this.imageViewer.classList.add("hidden");
			}, 300);
		}
	}

	closeModal() {
		if (this.modal) {
			this.modal.classList.remove("show");
			document.body.style.overflow = "";
			// After hide transition, hide from layout so `hidden` class keeps it non-interactive
			setTimeout(() => {
				if (this.modal) this.modal.classList.add("hidden");
			}, 300);
		}
	}

	downloadImage(imageData) {
		const a = document.createElement("a");
		a.href = imageData.url;
		a.download = imageData.name;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	async downloadAllAsZip() {
		if (this.processedImages.length === 0) {
			alert("No processed images to download.");
			return;
		}

		try {
			const zip = new JSZip();

			for (const imageData of this.processedImages) {
				zip.file(imageData.name, imageData.blob);
			}

			const zipBlob = await zip.generateAsync({ type: "blob" });

			const url = URL.createObjectURL(zipBlob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "watermarked_images.zip";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Error creating ZIP file:", error);
			alert("Error creating ZIP file.");
		}
	}

	async downloadSelectedAsZip() {
		// collect selected indexes
		const selected = [];
		document.querySelectorAll(".image-select").forEach((cb) => {
			if (cb.checked) selected.push(Number(cb.dataset.idx));
		});

		let items = this.processedImages;
		if (selected.length > 0) {
			items = selected.map((i) => this.processedImages[i]).filter(Boolean);
		}

		if (!items || items.length === 0) {
			alert("No images selected for download");
			return;
		}

		try {
			const zip = new JSZip();

			for (const imageData of items) {
				zip.file(imageData.name, imageData.blob);
			}

			const zipBlob = await zip.generateAsync({ type: "blob" });

			const url = URL.createObjectURL(zipBlob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "watermarked_images_selected.zip";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Error creating ZIP:", error);
			alert("Error creating ZIP file.");
		}
	}
}

/**
 * BULK WATERMARK APPLICATION - Main Application Class
 *
 * A comprehensive image watermarking tool supporting both text and logo watermarks
 * with advanced pattern layouts, spacing controls, and batch processing capabilities.
 *
 * KEY FEATURES:
 * - Dual watermark types: text with effects, logo images
 * - Pattern modes: single placement, diagonal grids, orthogonal grids
 * - Independent X/Y spacing controls with intuitive 0-20 scale
 * - Performance-optimized with intelligent caching system
 * - Batch processing with ZIP download
 * - Real-time preview with responsive scaling
 */
class BulkWatermarkApp {
	constructor() {
		// File management arrays
		this.uploadedFiles = []; // Original uploaded image files with metadata
		this.processedImages = []; // Final watermarked images ready for download

		/*
		 * WATERMARK CONFIGURATION: Complete settings object defining appearance and behavior.
		 * These settings drive all watermark rendering and are synchronized with UI controls.
		 */
		this.watermarkSettings = {
			// Core watermark properties
			type: "text", // "text" | "logo" - determines rendering pipeline
			patternMode: "single", // "single" | "diagonal" | "grid" - layout mode

			// Text watermark configuration
			text: "© Your Watermark", // Displayed text content
			fontSize: 24, // Base font size (scaled by canvas)
			fontFamily: "Arial", // Font family name
			textColor: "#ffffff", // Text fill color (hex format)

			// Common properties
			opacity: 70, // Transparency percentage (0-100)
			position: "bottom-right", // Single mode position key
			offsetX: 0, // Fine position adjustment (pixels)
			offsetY: 0, // Fine position adjustment (pixels)
			watermarkRotation: 0, // Individual watermark rotation (degrees)

			// Logo watermark configuration
			watermarkLogo: null, // Image object for logo mode
			logoScale: 20, // Logo size percentage (1-500)

			// Pattern spacing configuration (NEW: 0-20 UI scale)
			patternSpacing: 6, // Legacy: unified spacing (deprecated)
			patternSpacingX: 6, // Horizontal spacing (0=touching, 20=maximum)
			patternSpacingY: 7, // Vertical spacing (0=touching, 20=maximum)
			patternAngle: -45, // Pattern rotation angle (degrees)

			/*
			 * TEXT EFFECTS: Advanced visual enhancements for text watermarks.
			 * Each effect can be independently enabled/configured.
			 */
			textEffects: {
				// Drop shadow effect
				shadow: false, // Enable/disable shadow
				shadowColor: "#000000", // Shadow color
				shadowBlur: 6, // Shadow blur radius
				shadowOffsetX: 2, // Shadow horizontal offset
				shadowOffsetY: 2, // Shadow vertical offset

				// Text outline effect
				outline: false, // Enable/disable outline
				outlineColor: "#000000", // Outline stroke color
				outlineThickness: 2, // Outline stroke width

				// Glow effect
				glow: false, // Enable/disable glow
				glowColor: "#ffffff", // Glow color (usually matches text)
				glowBlur: 12, // Glow blur radius
			},

			// Logo overlay effects
			overlayEffect: "none", // "none" | "tint" - logo processing mode
		};

		/*
		 * PERFORMANCE OPTIMIZATION: Watermark cache system using Map for O(1) lookups.
		 * Caches are keyed by comprehensive settings hash including quantized canvas dimensions.
		 * This enables intelligent cache reuse across similar images and identical settings.
		 */
		this._watermarkCacheMap = new Map();

		/*
		 * POSITION MAPPING: Predefined coordinates for single watermark placement.
		 * Values are normalized (0-1) relative to canvas dimensions.
		 * Coordinates positioned for tight corner alignment without excessive padding.
		 */
		this.positionMap = {
			"top-left": { x: 0.06, y: 0.06 }, // Near top-left corner
			"top-center": { x: 0.5, y: 0.06 }, // Top edge, centered
			"top-right": { x: 0.94, y: 0.06 }, // Near top-right corner
			"middle-left": { x: 0.06, y: 0.5 }, // Left edge, centered
			center: { x: 0.5, y: 0.5 }, // Exact center
			"middle-right": { x: 0.94, y: 0.5 }, // Right edge, centered
			"bottom-left": { x: 0.06, y: 0.94 }, // Near bottom-left corner
			"bottom-center": { x: 0.5, y: 0.94 }, // Bottom edge, centered
			"bottom-right": { x: 0.94, y: 0.94 }, // Near bottom-right corner
		};

		// Initialize application components and event bindings
		this.init();
	}

	// Convert UI spacing values (0-20) to actual pixel values for rendering
	// This function now handles the complete spacing calculation including canvas scaling
	/**
	 * Convert UI spacing values (0-20) to actual pixel values for watermark positioning.
	 * This is the core spacing calculation that determines center-to-center distances between watermarks.
	 *
	 * @param {number} uiValue - User input value from 0-20 slider
	 * @param {number} baseSize - The watermark's base dimension (width for X, height for Y)
	 * @param {number} canvasScale - Canvas scaling factor (canvasSize/800) for responsive sizing
	 * @param {boolean} isVertical - Whether this is vertical (Y) spacing calculation
	 * @returns {number} Center-to-center distance in pixels
	 */
	convertSpacingToPixels(uiValue, baseSize, canvasScale = 1, isVertical = false) {
		// Scale the watermark size to match the current canvas dimensions
		const actualWatermarkSize = baseSize * canvasScale;

		if (uiValue <= 0) {
			// Value 0 = "touching" behavior: watermarks placed edge-to-edge with no gap
			// Return just the watermark size so center-to-center equals edge-to-edge
			return actualWatermarkSize;
		}

		/*
		 * For values 1-20, create progressive spacing with guaranteed minimum gap.
		 * The algorithm ensures value 1 never causes overlap by providing substantial minimum gap.
		 */

		// Minimum gap for value 1 - aggressive sizing prevents any overlap issues
		// Uses larger of: 30 scaled pixels OR 50% of watermark size
		const minGap = Math.max(30 * canvasScale, actualWatermarkSize * 0.5);

		// Maximum gap for value 20 - scales with watermark size for proportional spacing
		const maxGap = Math.max(actualWatermarkSize * 3, 500 * canvasScale);

		// Linear interpolation between min and max gaps for smooth progression
		const gapRange = maxGap - minGap;
		const gapSize = minGap + ((uiValue - 1) / 19) * gapRange;

		// Final result: watermark size + calculated gap = center-to-center distance
		const result = Math.round(actualWatermarkSize + gapSize);

		console.log(
			`Spacing calc (${
				isVertical ? "Y" : "X"
			}): UI=${uiValue}, base=${baseSize}, scale=${canvasScale}, actualSize=${actualWatermarkSize}, minGap=${minGap}, gapSize=${gapSize}, result=${result}`
		);

		return result;
	}
	init() {
		/* Make globally available */
		window.watermarkApp = this;

		/* Initialize components */
		this.fileUploadHandler = new FileUploadHandler();
		this.modal = new ProcessedImageModal();

		/* Wait for DOM then bind events */
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", () => {
				this.bindEvents();
				this.initializeControls();
				/* Ensure 'single' pattern is selected on load */
				try {
					this.watermarkSettings.patternMode = "single";
					const radios = document.querySelectorAll('input[name="patternMode"]');
					radios.forEach((r) => {
						r.checked = r.value === "single";
					});
					this.updatePatternModeUI();
					this.updatePreview();
				} catch (err) {
					console.warn("Failed to enforce single pattern mode on init", err);
				}
				this.updateUI();
			});
		} else {
			this.bindEvents();
			this.initializeControls();
			/* Ensure 'single' pattern is selected on load */
			try {
				this.watermarkSettings.patternMode = "single";
				const radios = document.querySelectorAll('input[name="patternMode"]');
				radios.forEach((r) => {
					r.checked = r.value === "single";
				});
				this.updatePatternModeUI();
				this.updatePreview();
			} catch (err) {
				console.warn("Failed to enforce single pattern mode on init", err);
			}
			this.updateUI();
		}
	}

	addFiles(files) {
		files.forEach((file) => {
			const fileData = {
				file: file,
				name: file.name,
				size: file.size,
				id: Date.now() + Math.random(),
				preview: null,
				loaded: false,
				error: null,
			};

			this.uploadedFiles.push(fileData);
			this.loadImagePreview(fileData);
		});

		this.updateUI();
	}

	loadImagePreview(fileData) {
		const reader = new FileReader();

		reader.onload = (e) => {
			fileData.preview = e.target.result;
			fileData.loaded = true;
			this.renderImageGrid();

			// Update preview if this is the first loaded file
			if (this.getLoadedFiles().length === 1) {
				setTimeout(() => this.updatePreview(), 500);
			}
		};

		reader.onerror = () => {
			fileData.error = "Failed to load image";
			this.renderImageGrid();
		};

		reader.readAsDataURL(fileData.file);
	}

	bindEvents() {
		/* Clear files */
		const clearBtn = document.getElementById("clearFiles");
		if (clearBtn) {
			clearBtn.addEventListener("click", () => this.clearAllFiles());
		}

		/* Reset to defaults button */
		const resetBtn = document.getElementById("resetDefaults");
		if (resetBtn) {
			resetBtn.addEventListener("click", () => this.resetToDefaults());
		}

		// Watermark type toggles
		const textToggle = document.getElementById("textToggle");
		const logoToggle = document.getElementById("logoToggle");
		if (textToggle) textToggle.addEventListener("click", () => this.setWatermarkType("text"));
		if (logoToggle) logoToggle.addEventListener("click", () => this.setWatermarkType("logo"));

		// Pattern mode
		document.querySelectorAll('input[name="patternMode"]').forEach((radio) => {
			radio.addEventListener("change", (e) => {
				this.watermarkSettings.patternMode = e.target.value;
				this.updatePatternModeUI();
				this.updatePreview();
			});
		});

		// Text controls
		this.bindTextControls();

		// Image controls
		this.bindLogoControls();

		// Range controls
		this.bindRangeControls();

		// Position controls
		this.bindPositionControls();

		// Processing
		this.bindProcessingControls();
	}

	bindTextControls() {
		const textContent = document.getElementById("textContent");
		const fontFamily = document.getElementById("fontFamily");
		const textColor = document.getElementById("textColor");

		if (textContent) {
			textContent.addEventListener("input", () => {
				this.watermarkSettings.text = textContent.value;
				this.updatePreview();
			});
		}

		if (fontFamily) {
			fontFamily.addEventListener("change", () => {
				this.watermarkSettings.fontFamily = fontFamily.value;
				this.updatePreview();
			});
		}

		if (textColor) {
			textColor.addEventListener("change", () => {
				this.watermarkSettings.textColor = textColor.value;
				this.updatePreview();
			});
		}
	}

	bindLogoControls() {
		const watermarkLogo = document.getElementById("watermarkLogo");
		if (watermarkLogo) {
			watermarkLogo.addEventListener("change", (e) => {
				const file = e.target.files[0];
				if (file) {
					const reader = new FileReader();
					reader.onload = (e) => {
						const img = new Image();
						img.onload = () => {
							this.watermarkSettings.watermarkLogo = img;
							/* Switch to logo watermark mode */
							try {
								this.setWatermarkType("logo");
							} catch (err) {
								this.watermarkSettings.type = "logo";
							}

							/* Update logo control visibility now that logo is uploaded */
							this.updateLogoControlsVisibility();

							const previewImg = document.getElementById("watermarkPreviewImg");
							const watermarkPreview = document.getElementById("watermarkPreview");

							if (previewImg && watermarkPreview) {
								previewImg.src = e.target.result;
								watermarkPreview.classList.remove("hidden");
							}

							/* Ensure logoScale setting is synced */
							const logoScaleEl = document.getElementById("logoScale");
							const logoScaleNum = document.getElementById("logoScaleNumber");
							if (logoScaleEl)
								this.watermarkSettings.logoScale =
									Number(logoScaleEl.value) || this.watermarkSettings.logoScale;
							if (logoScaleNum)
								this.watermarkSettings.logoScale =
									Number(logoScaleNum.value) || this.watermarkSettings.logoScale;

							/* Prebuild watermark cache for immediate rendering */
							try {
								const tempCanvas = document.createElement("canvas");
								tempCanvas.width = Math.max(200, img.width);
								tempCanvas.height = Math.max(200, img.height);
								const tctx = tempCanvas.getContext("2d");
								this.buildWatermarkCache(tctx, tempCanvas.width, tempCanvas.height);
							} catch (err) {
								/* fail silently */
							}

							this.updateFormControls();
							this.updatePreview();
						};
						img.src = e.target.result;
					};
					reader.readAsDataURL(file);
				}
			});
		}
	}

	bindRangeControls() {
		const controls = ["fontSize", "logoScale", "opacity", "patternAngle", "watermarkRotation"];
		const logoControls = ["logoOpacity", "logoRotation", "logoPatternAngle"];

		controls.forEach((controlId) => {
			const rangeEl = document.getElementById(controlId);
			const numberEl = document.getElementById(controlId + "Number");

			if (rangeEl) {
				rangeEl.addEventListener("input", (e) => {
					const value = parseInt(e.target.value);
					this.watermarkSettings[controlId] = value;
					this.syncControls(controlId, value);
					this.updatePreview();
				});
			}

			if (numberEl) {
				numberEl.addEventListener("input", (e) => {
					const value = parseInt(e.target.value);
					this.watermarkSettings[controlId] = value;
					this.syncControls(controlId, value);
					this.updatePreview();
				});
			}
		});

		// Logo-specific controls that map to the same settings
		logoControls.forEach((controlId) => {
			const rangeEl = document.getElementById(controlId);
			const numberEl = document.getElementById(controlId + "Number");
			let settingsKey;

			// Map logo control IDs to actual settings keys
			switch (controlId) {
				case "logoOpacity":
					settingsKey = "opacity";
					break;
				case "logoRotation":
					settingsKey = "watermarkRotation";
					break;
				case "logoPatternAngle":
					settingsKey = "patternAngle";
					break;
			}

			if (rangeEl && settingsKey) {
				rangeEl.addEventListener("input", (e) => {
					const value = parseInt(e.target.value);
					this.watermarkSettings[settingsKey] = value;
					this.syncLogoControls(controlId, value);
					this.updatePreview();
				});
			}

			if (numberEl && settingsKey) {
				numberEl.addEventListener("input", (e) => {
					const value = parseInt(e.target.value);
					this.watermarkSettings[settingsKey] = value;
					this.syncLogoControls(controlId, value);
					this.updatePreview();
				});
			}
		});

		// Overlay effect
		// Text-only effect controls (shadow, outline, glow)
		const effectShadow = document.getElementById("effectShadow");
		const effectShadowColor = document.getElementById("effectShadowColor");
		const effectShadowBlur = document.getElementById("effectShadowBlur");
		const effectShadowOffsetX = document.getElementById("effectShadowOffsetX");
		const effectShadowOffsetY = document.getElementById("effectShadowOffsetY");

		const effectOutline = document.getElementById("effectOutline");
		const effectOutlineColor = document.getElementById("effectOutlineColor");
		const effectOutlineThickness = document.getElementById("effectOutlineThickness");

		const effectGlow = document.getElementById("effectGlow");
		const effectGlowColor = document.getElementById("effectGlowColor");
		const effectGlowBlur = document.getElementById("effectGlowBlur");

		const bindEffect = (el, setter) => {
			if (!el) return;
			el.addEventListener("input", () => {
				setter();
				this.updatePreview();
			});
		};

		bindEffect(effectShadow, () => (this.watermarkSettings.textEffects.shadow = !!effectShadow.checked));
		bindEffect(effectShadowColor, () => (this.watermarkSettings.textEffects.shadowColor = effectShadowColor.value));
		bindEffect(
			effectShadowBlur,
			() => (this.watermarkSettings.textEffects.shadowBlur = Number(effectShadowBlur.value))
		);
		bindEffect(
			effectShadowOffsetX,
			() => (this.watermarkSettings.textEffects.shadowOffsetX = Number(effectShadowOffsetX.value))
		);
		bindEffect(
			effectShadowOffsetY,
			() => (this.watermarkSettings.textEffects.shadowOffsetY = Number(effectShadowOffsetY.value))
		);

		bindEffect(effectOutline, () => (this.watermarkSettings.textEffects.outline = !!effectOutline.checked));
		bindEffect(
			effectOutlineColor,
			() => (this.watermarkSettings.textEffects.outlineColor = effectOutlineColor.value)
		);
		bindEffect(
			effectOutlineThickness,
			() => (this.watermarkSettings.textEffects.outlineThickness = Number(effectOutlineThickness.value))
		);

		bindEffect(effectGlow, () => (this.watermarkSettings.textEffects.glow = !!effectGlow.checked));
		bindEffect(effectGlowColor, () => (this.watermarkSettings.textEffects.glowColor = effectGlowColor.value));
		bindEffect(effectGlowBlur, () => (this.watermarkSettings.textEffects.glowBlur = Number(effectGlowBlur.value)));

		// New compact horizontal/vertical spacing controls
		const spX = document.getElementById("patternSpacingX");
		const spY = document.getElementById("patternSpacingY");
		const spXNum = document.getElementById("patternSpacingXNumber");
		const spYNum = document.getElementById("patternSpacingYNumber");

		// Logo pattern spacing controls
		const logoSpX = document.getElementById("logoPatternSpacingX");
		const logoSpY = document.getElementById("logoPatternSpacingY");
		const logoSpXNum = document.getElementById("logoPatternSpacingXNumber");
		const logoSpYNum = document.getElementById("logoPatternSpacingYNumber");

		if (spX) {
			spX.addEventListener("input", (e) => {
				const v = parseInt(e.target.value);
				this.watermarkSettings.patternSpacingX = v;
				const el = document.getElementById("patternSpacingXValue");
				if (el) el.textContent = v; // Show the actual UI value, not a pixel estimate
				if (spXNum) spXNum.value = v;
				this.updatePreview();
			});
		}

		if (spY) {
			spY.addEventListener("input", (e) => {
				const v = parseInt(e.target.value);
				this.watermarkSettings.patternSpacingY = v;
				const el = document.getElementById("patternSpacingYValue");
				if (el) el.textContent = v; // Show the actual UI value, not a pixel estimate
				if (spYNum) spYNum.value = v;
				this.updatePreview();
			});
		}

		if (spXNum) {
			spXNum.addEventListener("input", (e) => {
				const v = parseInt(e.target.value);
				this.watermarkSettings.patternSpacingX = v;
				if (spX) spX.value = v;
				const el = document.getElementById("patternSpacingXValue");
				if (el) el.textContent = v;
				this.updatePreview();
			});
		}

		if (spYNum) {
			spYNum.addEventListener("input", (e) => {
				const v = parseInt(e.target.value);
				this.watermarkSettings.patternSpacingY = v;
				if (spY) spY.value = v;
				const el = document.getElementById("patternSpacingYValue");
				if (el) el.textContent = v;
				this.updatePreview();
			});
		}

		// Logo pattern spacing controls
		if (logoSpX) {
			logoSpX.addEventListener("input", (e) => {
				const v = parseInt(e.target.value);
				this.watermarkSettings.patternSpacingX = v;
				const el = document.getElementById("logoPatternSpacingXValue");
				if (el) el.textContent = v; // Show the actual UI value, not a pixel estimate
				if (logoSpXNum) logoSpXNum.value = v;
				this.updatePreview();
			});
		}

		if (logoSpY) {
			logoSpY.addEventListener("input", (e) => {
				const v = parseInt(e.target.value);
				this.watermarkSettings.patternSpacingY = v;
				const el = document.getElementById("logoPatternSpacingYValue");
				if (el) el.textContent = v; // Show the actual UI value, not a pixel estimate
				if (logoSpYNum) logoSpYNum.value = v;
				this.updatePreview();
			});
		}

		if (logoSpXNum) {
			logoSpXNum.addEventListener("input", (e) => {
				const v = parseInt(e.target.value);
				this.watermarkSettings.patternSpacingX = v;
				if (logoSpX) logoSpX.value = v;
				const el = document.getElementById("logoPatternSpacingXValue");
				if (el) el.textContent = v;
				this.updatePreview();
			});
		}

		if (logoSpYNum) {
			logoSpYNum.addEventListener("input", (e) => {
				const v = parseInt(e.target.value);
				this.watermarkSettings.patternSpacingY = v;
				if (logoSpY) logoSpY.value = v;
				const el = document.getElementById("logoPatternSpacingYValue");
				if (el) el.textContent = v;
				this.updatePreview();
			});
		}
	}

	bindPositionControls() {
		// Text position controls
		document.querySelectorAll("#positionGrid .position-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				this.setPosition(btn.dataset.position);
				this.updatePreview();
			});
		});

		// Logo position controls
		document.querySelectorAll("#logoPositionGrid .position-btn").forEach((btn) => {
			btn.addEventListener("click", () => {
				this.setPosition(btn.dataset.position);
				this.updatePreview();
			});
		});

		// Text offset controls
		const offsetX = document.getElementById("offsetX");
		const offsetY = document.getElementById("offsetY");

		if (offsetX) {
			offsetX.addEventListener("input", (e) => {
				this.watermarkSettings.offsetX = parseInt(e.target.value);
				const valueEl = document.getElementById("offsetXValue");
				if (valueEl) valueEl.textContent = e.target.value;
				this.updatePreview();
			});
		}

		if (offsetY) {
			offsetY.addEventListener("input", (e) => {
				this.watermarkSettings.offsetY = parseInt(e.target.value);
				const valueEl = document.getElementById("offsetYValue");
				if (valueEl) valueEl.textContent = e.target.value;
				this.updatePreview();
			});
		}

		// Logo offset controls
		const logoOffsetX = document.getElementById("logoOffsetX");
		const logoOffsetY = document.getElementById("logoOffsetY");

		if (logoOffsetX) {
			logoOffsetX.addEventListener("input", (e) => {
				this.watermarkSettings.offsetX = parseInt(e.target.value);
				const valueEl = document.getElementById("logoOffsetXValue");
				if (valueEl) valueEl.textContent = e.target.value;
				this.updatePreview();
			});
		}

		if (logoOffsetY) {
			logoOffsetY.addEventListener("input", (e) => {
				this.watermarkSettings.offsetY = parseInt(e.target.value);
				const valueEl = document.getElementById("logoOffsetYValue");
				if (valueEl) valueEl.textContent = e.target.value;
				this.updatePreview();
			});
		}
	}

	bindProcessingControls() {
		const processBtn = document.getElementById("processBtn");
		const downloadZipBtn = document.getElementById("downloadZip");
		const showGalleryBtn = document.getElementById("showGalleryBtn");

		if (processBtn) {
			processBtn.addEventListener("click", () => this.processAllImages());
		}

		if (downloadZipBtn) {
			downloadZipBtn.addEventListener("click", () => this.downloadZip());
		}

		if (showGalleryBtn) {
			// Always open the gallery modal when clicked; the modal will show an empty-state if no images
			showGalleryBtn.addEventListener("click", () => {
				try {
					if (this.modal && typeof this.modal.showModal === "function") {
						this.modal.showModal(this.processedImages || []);
					} else {
						alert("Gallery is not available.");
					}
				} catch (e) {
					console.error("Failed to open gallery:", e);
				}
			});
		}
	}

	syncControls(controlId, value) {
		const rangeEl = document.getElementById(controlId);
		const numberEl = document.getElementById(controlId + "Number");
		const valueEl = document.getElementById(controlId + "Value");

		if (rangeEl) rangeEl.value = value;
		if (numberEl) numberEl.value = value;
		if (valueEl) valueEl.textContent = value;
	}

	syncLogoControls(controlId, value) {
		const rangeEl = document.getElementById(controlId);
		const numberEl = document.getElementById(controlId + "Number");
		const valueEl = document.getElementById(controlId + "Value");

		if (rangeEl) rangeEl.value = value;
		if (numberEl) numberEl.value = value;
		if (valueEl) valueEl.textContent = value;
	}

	initializeControls() {
		// Sync all initial values
		Object.keys(this.watermarkSettings).forEach((key) => {
			if (typeof this.watermarkSettings[key] === "number") {
				this.syncControls(key, this.watermarkSettings[key]);
			}
		});

		// Ensure the new spacing controls show 0 when defaulted to 0
		const spx = document.getElementById("patternSpacingX");
		const spy = document.getElementById("patternSpacingY");
		const spxVal = document.getElementById("patternSpacingXValue");
		const spyVal = document.getElementById("patternSpacingYValue");
		if (spx) spx.value = Number(this.watermarkSettings.patternSpacingX || 0);
		if (spy) spy.value = Number(this.watermarkSettings.patternSpacingY || 0);
		if (spxVal) spxVal.textContent = this.watermarkSettings.patternSpacingX || 0;
		if (spyVal) spyVal.textContent = this.watermarkSettings.patternSpacingY || 0;
		// If preview canvas exists, show an estimated pixel value instead of raw slider unit
		const previewCanvas = document.getElementById("previewCanvas");
		// Remove pixel display since we're now showing just numerical values
		// The UI values (0-20) are displayed directly without conversion

		/* Set initial pattern mode UI */
		this.updatePatternModeUI();

		/* Set initial logo control visibility */
		this.updateLogoControlsVisibility();
	}

	updatePatternModeUI() {
		const patternControls = document.getElementById("patternControls");
		const positionControls = document.getElementById("positionControls");
		const offsetControls = document.getElementById("offsetControls");
		const patternAngleGroup = document.getElementById("patternAngleGroup");

		// Logo controls
		const logoPatternControls = document.getElementById("logoPatternControls");
		const logoPositionControls = document.getElementById("logoPositionControls");
		const logoOffsetControls = document.getElementById("logoOffsetControls");
		const logoPatternAngleGroup = document.getElementById("logoPatternAngleGroup");

		const mode = this.watermarkSettings.patternMode;

		if (mode === "single") {
			// Text controls
			if (patternControls) patternControls.classList.add("hidden");
			if (positionControls) positionControls.classList.remove("hidden");
			if (offsetControls) offsetControls.classList.remove("hidden");

			// Logo controls
			if (logoPatternControls) logoPatternControls.classList.add("hidden");
			if (logoPositionControls) logoPositionControls.classList.remove("hidden");
			if (logoOffsetControls) logoOffsetControls.classList.remove("hidden");
		} else {
			// Text controls
			if (patternControls) patternControls.classList.remove("hidden");
			if (positionControls) positionControls.classList.add("hidden");
			if (offsetControls) offsetControls.classList.add("hidden");

			// Logo controls
			if (logoPatternControls) logoPatternControls.classList.remove("hidden");
			if (logoPositionControls) logoPositionControls.classList.add("hidden");
			if (logoOffsetControls) logoOffsetControls.classList.add("hidden");

			if (patternAngleGroup) {
				// Show angle control only for tiled mode (angle controls diagonal orientation)
				if (mode === "tiled") {
					patternAngleGroup.classList.remove("hidden");
				} else {
					patternAngleGroup.classList.add("hidden");
				}
			}

			if (logoPatternAngleGroup) {
				// Show logo angle control only for tiled mode
				if (mode === "tiled") {
					logoPatternAngleGroup.classList.remove("hidden");
				} else {
					logoPatternAngleGroup.classList.add("hidden");
				}
			}
		}
	}

	setWatermarkType(type) {
		this.watermarkSettings.type = type;

		/* Clear watermark cache when switching types to prevent artifacts */
		this._watermarkCacheMap.clear();
		this._watermarkCache = null;

		document.querySelectorAll(".toggle-btn").forEach((btn) => btn.classList.remove("active"));
		const toggleBtn = document.getElementById(type + "Toggle");
		if (toggleBtn) toggleBtn.classList.add("active");

		const textOptions = document.getElementById("textOptions");
		const logoOptions = document.getElementById("logoOptions");

		if (type === "text") {
			if (textOptions) textOptions.classList.remove("hidden");
			if (logoOptions) logoOptions.classList.add("hidden");
			const te = document.getElementById("textEffectsControls");
			if (te) te.classList.remove("hidden");
		} else if (type === "logo") {
			if (textOptions) textOptions.classList.add("hidden");
			if (logoOptions) logoOptions.classList.remove("hidden");
			const te = document.getElementById("textEffectsControls");
			if (te) te.classList.add("hidden");

			/* Update logo control visibility based on upload status */
			this.updateLogoControlsVisibility();
		}

		this.updatePreview();
	}

	updateLogoControlsVisibility() {
		const hasLogo = !!this.watermarkSettings.watermarkLogo;
		const logoConfigContainer = document.getElementById("logoConfigContainer");

		if (logoConfigContainer) {
			if (hasLogo) {
				logoConfigContainer.classList.remove("hidden");
			} else {
				logoConfigContainer.classList.add("hidden");
			}
		}
	}

	setPosition(position) {
		this.watermarkSettings.position = position;

		// Update both text and logo position grids
		document.querySelectorAll("#positionGrid .position-btn").forEach((btn) => btn.classList.remove("active"));
		document.querySelectorAll("#logoPositionGrid .position-btn").forEach((btn) => btn.classList.remove("active"));

		const textTargetBtn = document.querySelector(`#positionGrid [data-position="${position}"]`);
		if (textTargetBtn) {
			textTargetBtn.classList.add("active");
		}

		const logoTargetBtn = document.querySelector(`#logoPositionGrid [data-position="${position}"]`);
		if (logoTargetBtn) {
			logoTargetBtn.classList.add("active");
		}
	}

	resetToDefaults() {
		/* Clear all caches */
		this._watermarkCacheMap.clear();
		this._watermarkCache = null;

		/* Store current mode and watermark logo to preserve them */
		const currentType = this.watermarkSettings.type;
		const currentWatermarkLogo = this.watermarkSettings.watermarkLogo;

		// Create default settings
		const defaultSettings = {
			type: currentType, // Preserve current type instead of forcing text
			patternMode: "single",
			text: "© Your Watermark",
			fontSize: 24,
			fontFamily: "Arial",
			textColor: "#ffffff",
			opacity: 70,
			position: "bottom-right",
			offsetX: 0,
			offsetY: 0,
			watermarkLogo: currentWatermarkLogo /* Preserve current watermark logo */,
			logoScale: 20,
			patternSpacing: 6, // Good default spacing for visual separation (UI scale)
			patternSpacingX: 6, // Good default horizontal spacing to prevent overlap (UI scale)
			patternSpacingY: 7, // Higher default vertical spacing to prevent overlap (UI scale)
			patternAngle: -45,
			watermarkRotation: 0,
			overlayEffect: "none",
			textEffects: {
				shadow: false,
				shadowColor: "#000000",
				shadowBlur: 6,
				shadowOffsetX: 2,
				shadowOffsetY: 2,
				outline: false,
				outlineColor: "#000000",
				outlineThickness: 2,
				glow: false,
				glowColor: "#ffffff",
				glowBlur: 12,
			},
		};

		// Apply the default settings
		this.watermarkSettings = defaultSettings;

		// Update all form controls to reflect default values
		this.updateFormControls();

		// Update pattern mode UI (show/hide appropriate controls)
		this.updatePatternModeUI();

		// Set default position (but don't change type)
		this.setPosition("bottom-right");

		// Update preview
		this.updatePreview();
	}

	updateFormControls() {
		// Update text controls
		const textContent = document.getElementById("textContent");
		if (textContent) textContent.value = this.watermarkSettings.text;

		// Font size - range, number input, and display value
		const fontSize = document.getElementById("fontSize");
		if (fontSize) fontSize.value = this.watermarkSettings.fontSize;

		const fontSizeNumber = document.getElementById("fontSizeNumber");
		if (fontSizeNumber) fontSizeNumber.value = this.watermarkSettings.fontSize;

		const fontSizeValue = document.getElementById("fontSizeValue");
		if (fontSizeValue) fontSizeValue.textContent = this.watermarkSettings.fontSize;

		const fontFamily = document.getElementById("fontFamily");
		if (fontFamily) fontFamily.value = this.watermarkSettings.fontFamily;

		const textColor = document.getElementById("textColor");
		if (textColor) textColor.value = this.watermarkSettings.textColor;

		// Opacity - range, number input, and display value
		const opacity = document.getElementById("opacity");
		if (opacity) opacity.value = this.watermarkSettings.opacity;

		const opacityNumber = document.getElementById("opacityNumber");
		if (opacityNumber) opacityNumber.value = this.watermarkSettings.opacity;

		const opacityValue = document.getElementById("opacityValue");
		if (opacityValue) opacityValue.textContent = this.watermarkSettings.opacity;

		// Offset controls - range, number input, and display value
		const offsetX = document.getElementById("offsetX");
		if (offsetX) offsetX.value = this.watermarkSettings.offsetX;

		const offsetXNumber = document.getElementById("offsetXNumber");
		if (offsetXNumber) offsetXNumber.value = this.watermarkSettings.offsetX;

		const offsetXValue = document.getElementById("offsetXValue");
		if (offsetXValue) offsetXValue.textContent = this.watermarkSettings.offsetX;

		const offsetY = document.getElementById("offsetY");
		if (offsetY) offsetY.value = this.watermarkSettings.offsetY;

		const offsetYNumber = document.getElementById("offsetYNumber");
		if (offsetYNumber) offsetYNumber.value = this.watermarkSettings.offsetY;

		const offsetYValue = document.getElementById("offsetYValue");
		if (offsetYValue) offsetYValue.textContent = this.watermarkSettings.offsetY;

		// Image scale - range, number input, and display value
		const imageScale = document.getElementById("imageScale");
		if (imageScale) imageScale.value = this.watermarkSettings.imageScale;

		const imageScaleNumber = document.getElementById("imageScaleNumber");
		if (imageScaleNumber) imageScaleNumber.value = this.watermarkSettings.imageScale;

		const imageScaleValue = document.getElementById("imageScaleValue");
		if (imageScaleValue) imageScaleValue.textContent = this.watermarkSettings.imageScale;

		// Watermark rotation - range, number input, and display value
		const watermarkRotation = document.getElementById("watermarkRotation");
		if (watermarkRotation) watermarkRotation.value = this.watermarkSettings.watermarkRotation;

		const watermarkRotationNumber = document.getElementById("watermarkRotationNumber");
		if (watermarkRotationNumber) watermarkRotationNumber.value = this.watermarkSettings.watermarkRotation;

		const watermarkRotationValue = document.getElementById("watermarkRotationValue");
		if (watermarkRotationValue) watermarkRotationValue.textContent = this.watermarkSettings.watermarkRotation;

		// Pattern spacing controls - range, number input, and display value
		const patternSpacing = document.getElementById("patternSpacing");
		if (patternSpacing) patternSpacing.value = this.watermarkSettings.patternSpacing;

		const patternSpacingNumber = document.getElementById("patternSpacingNumber");
		if (patternSpacingNumber) patternSpacingNumber.value = this.watermarkSettings.patternSpacing;

		const patternSpacingValue = document.getElementById("patternSpacingValue");
		if (patternSpacingValue) patternSpacingValue.textContent = this.watermarkSettings.patternSpacing;

		const patternSpacingX = document.getElementById("patternSpacingX");
		if (patternSpacingX) patternSpacingX.value = this.watermarkSettings.patternSpacingX;

		const patternSpacingXNumber = document.getElementById("patternSpacingXNumber");
		if (patternSpacingXNumber) patternSpacingXNumber.value = this.watermarkSettings.patternSpacingX;

		const patternSpacingXValue = document.getElementById("patternSpacingXValue");
		if (patternSpacingXValue) patternSpacingXValue.textContent = this.watermarkSettings.patternSpacingX;

		const patternSpacingY = document.getElementById("patternSpacingY");
		if (patternSpacingY) patternSpacingY.value = this.watermarkSettings.patternSpacingY;

		const patternSpacingYNumber = document.getElementById("patternSpacingYNumber");
		if (patternSpacingYNumber) patternSpacingYNumber.value = this.watermarkSettings.patternSpacingY;

		const patternSpacingYValue = document.getElementById("patternSpacingYValue");
		if (patternSpacingYValue) patternSpacingYValue.textContent = this.watermarkSettings.patternSpacingY;

		// Pattern angle - range, number input, and display value
		const patternAngle = document.getElementById("patternAngle");
		if (patternAngle) patternAngle.value = this.watermarkSettings.patternAngle;

		const patternAngleNumber = document.getElementById("patternAngleNumber");
		if (patternAngleNumber) patternAngleNumber.value = this.watermarkSettings.patternAngle;

		const patternAngleValue = document.getElementById("patternAngleValue");
		if (patternAngleValue) patternAngleValue.textContent = this.watermarkSettings.patternAngle;

		// Update pattern mode radio buttons
		const patternModeRadios = document.querySelectorAll('input[name="patternMode"]');
		patternModeRadios.forEach((radio) => {
			radio.checked = radio.value === this.watermarkSettings.patternMode;
		});

		// Update text effects - checkboxes, colors, and number inputs
		const effectShadow = document.getElementById("effectShadow");
		if (effectShadow) effectShadow.checked = this.watermarkSettings.textEffects.shadow;

		const effectShadowColor = document.getElementById("effectShadowColor");
		if (effectShadowColor) effectShadowColor.value = this.watermarkSettings.textEffects.shadowColor;

		const effectShadowBlur = document.getElementById("effectShadowBlur");
		if (effectShadowBlur) effectShadowBlur.value = this.watermarkSettings.textEffects.shadowBlur;

		const effectShadowOffsetX = document.getElementById("effectShadowOffsetX");
		if (effectShadowOffsetX) effectShadowOffsetX.value = this.watermarkSettings.textEffects.shadowOffsetX;

		const effectShadowOffsetY = document.getElementById("effectShadowOffsetY");
		if (effectShadowOffsetY) effectShadowOffsetY.value = this.watermarkSettings.textEffects.shadowOffsetY;

		const effectOutline = document.getElementById("effectOutline");
		if (effectOutline) effectOutline.checked = this.watermarkSettings.textEffects.outline;

		const effectOutlineColor = document.getElementById("effectOutlineColor");
		if (effectOutlineColor) effectOutlineColor.value = this.watermarkSettings.textEffects.outlineColor;

		const effectOutlineThickness = document.getElementById("effectOutlineThickness");
		if (effectOutlineThickness) effectOutlineThickness.value = this.watermarkSettings.textEffects.outlineThickness;

		const effectGlow = document.getElementById("effectGlow");
		if (effectGlow) effectGlow.checked = this.watermarkSettings.textEffects.glow;

		const effectGlowColor = document.getElementById("effectGlowColor");
		if (effectGlowColor) effectGlowColor.value = this.watermarkSettings.textEffects.glowColor;

		const effectGlowBlur = document.getElementById("effectGlowBlur");
		if (effectGlowBlur) effectGlowBlur.value = this.watermarkSettings.textEffects.glowBlur;

		/* Only clear watermark logo input if there's no watermark logo in settings */
		/* This preserves the uploaded logo when doing a mode-dependent reset */
		const watermarkLogoInput = document.getElementById("watermarkLogo");
		if (watermarkLogoInput && !this.watermarkSettings.watermarkLogo) {
			watermarkLogoInput.value = "";
		}

		// Logo-specific controls that mirror the text controls
		// Logo opacity controls
		const logoOpacity = document.getElementById("logoOpacity");
		if (logoOpacity) logoOpacity.value = this.watermarkSettings.opacity;

		const logoOpacityNumber = document.getElementById("logoOpacityNumber");
		if (logoOpacityNumber) logoOpacityNumber.value = this.watermarkSettings.opacity;

		const logoOpacityValue = document.getElementById("logoOpacityValue");
		if (logoOpacityValue) logoOpacityValue.textContent = this.watermarkSettings.opacity;

		// Logo rotation controls
		const logoRotation = document.getElementById("logoRotation");
		if (logoRotation) logoRotation.value = this.watermarkSettings.watermarkRotation;

		const logoRotationNumber = document.getElementById("logoRotationNumber");
		if (logoRotationNumber) logoRotationNumber.value = this.watermarkSettings.watermarkRotation;

		const logoRotationValue = document.getElementById("logoRotationValue");
		if (logoRotationValue) logoRotationValue.textContent = this.watermarkSettings.watermarkRotation;

		// Logo pattern spacing controls
		const logoPatternSpacingX = document.getElementById("logoPatternSpacingX");
		if (logoPatternSpacingX) logoPatternSpacingX.value = this.watermarkSettings.patternSpacingX;

		const logoPatternSpacingXNumber = document.getElementById("logoPatternSpacingXNumber");
		if (logoPatternSpacingXNumber) logoPatternSpacingXNumber.value = this.watermarkSettings.patternSpacingX;

		const logoPatternSpacingXValue = document.getElementById("logoPatternSpacingXValue");
		if (logoPatternSpacingXValue) logoPatternSpacingXValue.textContent = this.watermarkSettings.patternSpacingX;

		const logoPatternSpacingY = document.getElementById("logoPatternSpacingY");
		if (logoPatternSpacingY) logoPatternSpacingY.value = this.watermarkSettings.patternSpacingY;

		const logoPatternSpacingYNumber = document.getElementById("logoPatternSpacingYNumber");
		if (logoPatternSpacingYNumber) logoPatternSpacingYNumber.value = this.watermarkSettings.patternSpacingY;

		const logoPatternSpacingYValue = document.getElementById("logoPatternSpacingYValue");
		if (logoPatternSpacingYValue) logoPatternSpacingYValue.textContent = this.watermarkSettings.patternSpacingY;

		// Logo pattern angle controls
		const logoPatternAngle = document.getElementById("logoPatternAngle");
		if (logoPatternAngle) logoPatternAngle.value = this.watermarkSettings.patternAngle;

		const logoPatternAngleNumber = document.getElementById("logoPatternAngleNumber");
		if (logoPatternAngleNumber) logoPatternAngleNumber.value = this.watermarkSettings.patternAngle;

		const logoPatternAngleValue = document.getElementById("logoPatternAngleValue");
		if (logoPatternAngleValue) logoPatternAngleValue.textContent = this.watermarkSettings.patternAngle;

		// Logo offset controls
		const logoOffsetX = document.getElementById("logoOffsetX");
		if (logoOffsetX) logoOffsetX.value = this.watermarkSettings.offsetX;

		const logoOffsetXValue = document.getElementById("logoOffsetXValue");
		if (logoOffsetXValue) logoOffsetXValue.textContent = this.watermarkSettings.offsetX;

		const logoOffsetY = document.getElementById("logoOffsetY");
		if (logoOffsetY) logoOffsetY.value = this.watermarkSettings.offsetY;

		const logoOffsetYValue = document.getElementById("logoOffsetYValue");
		if (logoOffsetYValue) logoOffsetYValue.textContent = this.watermarkSettings.offsetY;
	}

	getLoadedFiles() {
		return this.uploadedFiles.filter((file) => file.loaded && !file.error);
	}

	renderImageGrid() {
		const imageGrid = document.getElementById("imageGrid");
		if (!imageGrid) return;

		imageGrid.innerHTML = "";

		this.uploadedFiles.forEach((fileData) => {
			const imageItem = document.createElement("div");
			imageItem.className = "image-item";

			if (fileData.preview) {
				imageItem.innerHTML = `
                    <img src="${fileData.preview}" alt="${fileData.name}">
                    <div class="image-info">${fileData.name}</div>
                    <button class="remove-btn" data-id="${fileData.id}">×</button>
                `;
			} else if (fileData.error) {
				imageItem.innerHTML = `
                    <div style="height: 120px; display: flex; align-items: center; justify-content: center; background: var(--color-bg-4); color: var(--color-error); text-align: center; font-size: var(--font-size-xs);">
                        Error loading
                    </div>
                    <div class="image-info">${fileData.name}</div>
                    <button class="remove-btn" data-id="${fileData.id}">×</button>
                `;
			} else {
				imageItem.innerHTML = `
                    <div style="height: 120px; display: flex; align-items: center; justify-content: center; background: var(--color-bg-2);">
                        <div class="spinner"></div>
                    </div>
                    <div class="image-info">${fileData.name}</div>
                `;
			}

			const removeBtn = imageItem.querySelector(".remove-btn");
			if (removeBtn) {
				removeBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					this.removeFile(fileData.id);
				});
			}

			imageGrid.appendChild(imageItem);
		});
	}

	removeFile(id) {
		this.uploadedFiles = this.uploadedFiles.filter((file) => file.id !== id);
		this.renderImageGrid();
		this.updateUI();
		this.updatePreview();
	}

	clearAllFiles() {
		this.uploadedFiles = [];
		this.processedImages = [];
		this.renderImageGrid();
		this.updateUI();
		this.clearPreview();
	}

	clearPreview() {
		const canvas = document.getElementById("previewCanvas");
		if (canvas) {
			const ctx = canvas.getContext("2d");
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}
	}

	updateUI() {
		const fileList = document.getElementById("fileList");
		const configSection = document.getElementById("configSection");
		const previewSection = document.getElementById("previewSection");
		const processingSection = document.getElementById("processingSection");
		const fileCount = document.getElementById("fileCount");

		const hasFiles = this.uploadedFiles.length > 0;

		if (fileList) fileList.classList.toggle("hidden", !hasFiles);
		if (configSection) configSection.style.display = hasFiles ? "block" : "none";
		if (previewSection) previewSection.style.display = hasFiles ? "block" : "none";
		if (processingSection) processingSection.style.display = hasFiles ? "block" : "none";
		if (fileCount) fileCount.textContent = this.uploadedFiles.length;
	}

	updatePreview() {
		const loadedFiles = this.getLoadedFiles();
		if (loadedFiles.length === 0) return;

		const firstFile = loadedFiles[0];
		if (!firstFile.preview) return;

		const img = new Image();
		img.onload = () => this.renderPreview(img);
		img.src = firstFile.preview;
	}

	renderPreview(img) {
		const canvas = document.getElementById("previewCanvas");
		if (!canvas) return;

		const ctx = canvas.getContext("2d");

		// Calculate canvas size
		const maxWidth = 800;
		const maxHeight = 600;
		const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
		const width = Math.round(img.width * ratio);
		const height = Math.round(img.height * ratio);

		canvas.width = width;
		canvas.height = height;

		// Clear and draw image
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(img, 0, 0, width, height);

		/* If we have a logo watermark but no cache yet, build one sized to this preview so placement/spacing is accurate immediately */
		try {
			if (this.watermarkSettings.watermarkLogo && !this._watermarkCache) {
				this.buildWatermarkCache(ctx, width, height);
			}
		} catch (e) {
			/* ignore */
		}

		// Apply watermark
		this.applyWatermark(ctx, width, height);
	}

	applyWatermark(ctx, canvasWidth, canvasHeight) {
		const mode = this.watermarkSettings.patternMode;

		ctx.save();
		ctx.globalAlpha = this.watermarkSettings.opacity / 100;

		if (mode === "single") {
			this.applySingleWatermark(ctx, canvasWidth, canvasHeight);
		} else {
			// Treat diagonal and grid as a single tiled pattern implementation
			this.applyTiledPattern(ctx, canvasWidth, canvasHeight);
		}

		ctx.restore();
	}

	// FIXED: Single watermark positioning
	applySingleWatermark(ctx, canvasWidth, canvasHeight) {
		const position = this.positionMap[this.watermarkSettings.position];
		const angle = this.watermarkSettings.watermarkRotation || 0;

		// If corner placement requested in single mode, place watermark center so it is flush to the edge.
		const singleMode = this.watermarkSettings.patternMode === "single";
		const isCorner = position.x <= 0.2 || position.x >= 0.8 || position.y <= 0.2 || position.y >= 0.8;

		if (singleMode && isCorner) {
			// Prefer cached footprint for exact placement; fall back to estimation.
			let w = this._watermarkCache?.w || 0;
			let h = this._watermarkCache?.h || 0;
			if (!w || !h) {
				// Try a light estimate based on current settings
				if (this.watermarkSettings.type === "text") {
					const tmpFontSize = Math.max(8, (this.watermarkSettings.fontSize * canvasWidth) / 800);
					ctx.font = `${tmpFontSize}px ${this.watermarkSettings.fontFamily}`;
					const metrics = ctx.measureText(this.watermarkSettings.text || "Watermark");
					w =
						metrics.width ||
						tmpFontSize * (this.watermarkSettings.text ? this.watermarkSettings.text.length * 0.6 : 4);
					h = Math.ceil(tmpFontSize * 1.1);
				} else if (this.watermarkSettings.type === "logo" && this.watermarkSettings.watermarkLogo) {
					const img = this.watermarkSettings.watermarkLogo;
					const scale = this.getLogoScaleFraction();
					w = img.width * scale;
					h = img.height * scale;
				}
			}

			// Center coordinates that will place watermark content flush to edges
			let x = canvasWidth / 2;
			let y = canvasHeight / 2;

			if (position.x <= 0.2) x = w / 2;
			else if (position.x >= 0.8) x = canvasWidth - w / 2;

			if (position.y <= 0.2) y = h / 2;
			else if (position.y >= 0.8) y = canvasHeight - h / 2;

			// apply any fine offsets
			x += (this.watermarkSettings.offsetX * canvasWidth) / 800;
			y += (this.watermarkSettings.offsetY * canvasHeight) / 600;

			this.drawRotatedWatermark(ctx, x, y, angle);
			return;
		}

		/* Non-corner single placements use the regular drawing paths */
		if (this.watermarkSettings.type === "text") {
			this.drawTextWatermark(ctx, canvasWidth, canvasHeight, position);
		} else if (this.watermarkSettings.type === "logo" && this.watermarkSettings.watermarkLogo) {
			this.drawLogoWatermark(ctx, canvasWidth, canvasHeight, position);
		}
	}

	// New: combined tiled pattern (covers diagonal and grid)
	applyTiledPattern(ctx, canvasWidth, canvasHeight) {
		/*
			Compute rotation and build watermark cache first. Building the cache before computing
			spacing allows spacing math to account for the actual drawn watermark footprint
			(including padding/shadows) so we avoid accidental overlap when the slider is at min.
		*/
		const rotation = this.watermarkSettings.watermarkRotation;
		this.buildWatermarkCache(ctx, canvasWidth, canvasHeight);
		// Now compute spacing (computePatternSpacing will consult the cache footprint when present)
		const spacing = this.computePatternSpacing(ctx, canvasWidth, canvasHeight); // returns { x, y }

		// Use angle to decide whether to render a diagonal-leaning tiled layout or an orthogonal grid.
		const angle = Number(this.watermarkSettings.patternAngle || 0);
		const useDiagonal = Math.abs(angle) > 1; // small angles treated as grid

		/* Use per-axis spacing derived from computePatternSpacing result.
		   The spacing calculation already ensures safe values and handles "touching" behavior. */
		let safeSpacingX = spacing.x || spacing;
		let safeSpacingY = spacing.y || spacing;

		// For diagonal layouts we tile using independent horizontal (dx) and vertical (dy)
		// spacings projected onto the rotated axes. The computePatternSpacing function
		// already handled the conversion from UI scale to pixels, including edge-to-edge logic.
		let dx = safeSpacingX;
		let dy = safeSpacingY;
		const safeSpacingAvg = Math.max(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT2);
		const maxTilesPerAxis = 120; // hard cap to avoid freezing the UI when spacing is very small

		if (useDiagonal) {
			// diagonal-leaning tiled layout: iterate along rotated axes centered on canvas
			/*
				We project independent dx (horizontal gap) and dy (vertical gap) onto the rotated axes
				so the two sliders remain independent even with rotation. This avoids coupling X/Y
				spacing which previously happened when we used a single averaged spacing.
			*/
			const tiledExtent = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight);
			// Estimate counts separately along each tiled axis to bound loops
			let countX = Math.ceil(tiledExtent / dx) + 2;
			let countY = Math.ceil(tiledExtent / dy) + 2;
			let wasClamped = false;
			if (countX > maxTilesPerAxis) {
				countX = maxTilesPerAxis;
				wasClamped = true;
			}
			if (countY > maxTilesPerAxis) {
				countY = maxTilesPerAxis;
				wasClamped = true;
			}

			const rad = (angle * Math.PI) / 180;
			const cosA = Math.cos(rad);
			const sinA = Math.sin(rad);

			let tilesDrawn = 0;
			for (let i = -countX; i <= countX; i++) {
				for (let j = -countY; j <= countY; j++) {
					// Project independent dx/dy spacings onto rotated axes
					const x = i * dx * cosA - j * dy * sinA + canvasWidth / 2;
					const y = i * dx * sinA + j * dy * cosA + canvasHeight / 2;

					// Draw if within an extended viewport to reduce wasted draws
					const pad = Math.max(dx, dy);
					if (x > -pad && x < canvasWidth + pad && y > -pad && y < canvasHeight + pad) {
						this.drawRotatedWatermark(ctx, x, y, angle + rotation);
						tilesDrawn++;
					}
				}
			}
		} else {
			// grid: regular orthogonal grid starting at half-spacing offset
			const startX = (safeSpacingX / 2) % safeSpacingX;
			const startY = (safeSpacingY / 2) % safeSpacingY;

			// Determine iteration bounds in tile indices to avoid iterating many empty cells
			const countX = Math.min(Math.ceil((canvasWidth + safeSpacingX) / safeSpacingX) + 2, maxTilesPerAxis);
			const countY = Math.min(Math.ceil((canvasHeight + safeSpacingY) / safeSpacingY) + 2, maxTilesPerAxis);

			let tilesDrawn = 0;
			for (let ix = 0; ix < countX; ix++) {
				const x = startX + ix * safeSpacingX;
				for (let iy = 0; iy < countY; iy++) {
					const y = startY + iy * safeSpacingY;
					// quick in-viewport check
					if (
						x > -safeSpacingX &&
						x < canvasWidth + safeSpacingX &&
						y > -safeSpacingY &&
						y < canvasHeight + safeSpacingY
					) {
						this.drawRotatedWatermark(ctx, x, y, rotation);
						tilesDrawn++;
					}
				}
			}
		}
	}

	// Note: diagonal/grid implementations were consolidated into applyTiledPattern.

	/**
	 * Compute optimal pattern spacing to prevent watermark overlaps.
	 * This function analyzes the current watermark type and size to calculate appropriate
	 * spacing values for both X and Y axes independently.
	 *
	 * @param {CanvasRenderingContext2D} ctx - Canvas context for text measurements
	 * @param {number} canvasWidth - Current canvas width in pixels
	 * @param {number} canvasHeight - Current canvas height in pixels
	 * @returns {Object} {x: spacingX, y: spacingY} - Calculated spacing values in pixels
	 */
	computePatternSpacing(ctx, canvasWidth, canvasHeight) {
		// Default watermark size estimates for fallback calculations
		let estWidth = 100;
		let estHeight = 40;

		/*
		 * Calculate watermark dimensions based on type.
		 * Text watermarks: measure font metrics scaled to canvas
		 * Logo watermarks: scale image dimensions by user setting
		 */
		if (this.watermarkSettings.type === "text") {
			// Scale font size proportionally to canvas width for consistent appearance
			const fontSize = Math.max(12, (this.watermarkSettings.fontSize * canvasWidth) / 800);
			ctx.font = `${fontSize}px ${this.watermarkSettings.fontFamily}`;

			// Measure actual text dimensions, with fallback for empty/invalid text
			const metrics = ctx.measureText(this.watermarkSettings.text || "Watermark");
			estWidth =
				metrics.width ||
				fontSize * (this.watermarkSettings.text ? this.watermarkSettings.text.length * 0.6 : 4);
			estHeight = fontSize * 1.1; // Add 10% padding for text height
		} else if (this.watermarkSettings.type === "logo" && this.watermarkSettings.watermarkLogo) {
			// Calculate logo dimensions using current scale setting
			const img = this.watermarkSettings.watermarkLogo;
			const scale = this.getLogoScaleFraction();

			/*
			 * CONSISTENT LOGO SIZING: Use identical calculation as cache building.
			 * This ensures spacing calculations match actual rendered dimensions.
			 */
			const maxSize = Math.min(canvasWidth, canvasHeight) * scale;
			let imgRatio = Math.min(maxSize / Math.max(1, img.width), maxSize / Math.max(1, img.height));
			imgRatio = Math.max(imgRatio, 0.02); // Minimum 2% scale to prevent invisibility

			estWidth = Math.ceil(img.width * imgRatio);
			estHeight = Math.ceil(img.height * imgRatio);

			// Ensure minimum visible size
			const MIN_VISIBLE_PX = 6;
			if (estWidth < MIN_VISIBLE_PX) estWidth = MIN_VISIBLE_PX;
			if (estHeight < MIN_VISIBLE_PX) estHeight = MIN_VISIBLE_PX;
		}

		/*
		 * Independent base sizing for X and Y axes.
		 * This prevents forcing square spacing when watermarks are rectangular.
		 * Prefers cached dimensions when available for accuracy.
		 */
		let baseX = estWidth;
		let baseY = estHeight;

		if (this._watermarkCache && this._watermarkCache.w && this._watermarkCache.h) {
			// Use cached canvas footprint for more precise spacing calculations
			// Prefer visible content size (excludes padding) for accurate edge-to-edge positioning
			baseX = this._watermarkCache.contentW || this._watermarkCache.w;
			baseY = this._watermarkCache.contentH || this._watermarkCache.h;

			// Debug logging for troubleshooting spacing issues
			console.log("Using cache dimensions:", {
				cacheContentW: this._watermarkCache.contentW,
				cacheContentH: this._watermarkCache.contentH,
				cacheW: this._watermarkCache.w,
				cacheH: this._watermarkCache.h,
				baseX: baseX,
				baseY: baseY,
				estWidth: estWidth,
				estHeight: estHeight,
			});
		} else {
			// Debug logging when cache not available
			console.log("No cache available, using estimated dimensions:", {
				estWidth: estWidth,
				estHeight: estHeight,
				baseX: baseX,
				baseY: baseY,
			});
		}

		// Store computed base values for UI synchronization (slider range calculations)
		this._lastPatternBase = { x: baseX, y: baseY };
		this._lastPatternEst = { width: estWidth, height: estHeight };

		/*
		 * Convert UI spacing controls (0-20 scale) to pixel values.
		 * Process X and Y axes independently for maximum control flexibility.
		 */
		const uiSpacingX = Number(this.watermarkSettings.patternSpacingX) || 0;
		const uiSpacingY = Number(this.watermarkSettings.patternSpacingY) || 0;

		// Calculate canvas scaling factors for responsive spacing
		const canvasScaleX = canvasWidth / 800; // X-axis scale factor
		const canvasScaleY = canvasHeight / 800; // Y-axis scale factor

		// Convert UI values to actual pixel spacing using core conversion function
		const configuredPixelsX = this.convertSpacingToPixels(uiSpacingX, baseX, canvasScaleX, false);
		const configuredPixelsY = this.convertSpacingToPixels(uiSpacingY, baseY, canvasScaleY, true);

		/*
		 * Calculate minimal spacing bounds for UI validation.
		 * These represent the absolute minimum center-to-center distances.
		 */
		const minX = Math.max(1, Math.round(baseX));
		const minY = Math.max(1, Math.round(baseY));

		// Use calculated pixel values directly (conversion function handles all edge cases)
		let spacingX = configuredPixelsX;
		let spacingY = configuredPixelsY;

		/*
		 * Synchronize UI slider ranges with calculated values.
		 * Sets appropriate min/max/step values for consistent user experience.
		 */
		try {
			const sx = document.getElementById("patternSpacingX");
			const sy = document.getElementById("patternSpacingY");

			if (sx) {
				// UI scale is fixed 0-20 for intuitive control
				sx.min = 0; // 0 = touching
				sx.max = 20; // 20 = maximum spacing
				sx.step = 1; // Integer steps only
				// Only update value if slider not currently being dragged
				if (!sx.matches(":active")) sx.value = uiSpacingX;
			}

			if (sy) {
				sy.min = 0;
				sy.max = 20;
				sy.step = 1;
				if (!sy.matches(":active")) sy.value = uiSpacingY;
			}
		} catch (err) {
			// Graceful fallback if UI elements are missing
			if (console && console.warn) console.warn("Failed to sync patternSpacing X/Y sliders:", err);
		}

		return { x: spacingX, y: spacingY };
	}

	// FIXED: Text watermark with proper positioning
	drawTextWatermark(ctx, canvasWidth, canvasHeight, position) {
		const fontSize = Math.max(12, (this.watermarkSettings.fontSize * canvasWidth) / 800);
		ctx.font = `${fontSize}px ${this.watermarkSettings.fontFamily}`;
		ctx.textBaseline = "middle";

		// base coordinates
		let x = canvasWidth * position.x;
		let y = canvasHeight * position.y;

		// adjust to keep watermark inside canvas and aligned to corners
		const metrics = ctx.measureText(this.watermarkSettings.text);
		const textWidth =
			metrics.width || fontSize * (this.watermarkSettings.text ? this.watermarkSettings.text.length * 0.6 : 4);
		const textHeight = fontSize;

		// Padding: keep small by default. If in single mode and a corner position, reduce padding to bring watermark flush to edge.
		let padX = Math.min(12, Math.round(textWidth * 0.05) + 4);
		let padY = Math.min(12, Math.round(textHeight * 0.1) + 2);
		const singleMode = this.watermarkSettings.patternMode === "single";
		const isCorner = position.x <= 0.2 || position.x >= 0.8 || position.y <= 0.2 || position.y >= 0.8;
		if (singleMode && isCorner) {
			// allow exact flush: zero pad will place watermark at the edge.
			padX = 0;
			padY = 0;
		}

		// Clamp X/Y depending on alignment
		if (position.x <= 0.2) {
			x = Math.max(textWidth / 2 + padX, x);
			ctx.textAlign = "start";
		} else if (position.x >= 0.8) {
			x = Math.min(canvasWidth - textWidth / 2 - padX, x);
			ctx.textAlign = "end";
		} else {
			ctx.textAlign = "center";
		}

		if (position.y <= 0.2) {
			y = Math.max(textHeight / 2 + padY, y);
		} else if (position.y >= 0.8) {
			y = Math.min(canvasHeight - textHeight / 2 - padY, y);
		}

		// Apply offsets
		x += (this.watermarkSettings.offsetX * canvasWidth) / 800;
		y += (this.watermarkSettings.offsetY * canvasHeight) / 600;

		// Apply rotation and effects
		if (this.watermarkSettings.watermarkRotation !== 0) {
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate((this.watermarkSettings.watermarkRotation * Math.PI) / 180);
			this.applyTextEffects(ctx);
			// Outline (stroke) if enabled
			const te = this.watermarkSettings.textEffects || {};
			if (te.outline) {
				ctx.lineWidth = Math.max(1, (te.outlineThickness || 2) * (fontSize / 24));
				ctx.strokeStyle = te.outlineColor || "#000000";
				ctx.strokeText(this.watermarkSettings.text, 0, 0);
			}
			ctx.fillStyle = this.getEffectFillStyle(ctx);
			ctx.fillText(this.watermarkSettings.text, 0, 0);
			ctx.restore();
		} else {
			this.applyTextEffects(ctx);
			const te = this.watermarkSettings.textEffects || {};
			if (te.outline) {
				ctx.lineWidth = Math.max(1, (te.outlineThickness || 2) * (fontSize / 24));
				ctx.strokeStyle = te.outlineColor || "#000000";
				ctx.strokeText(this.watermarkSettings.text, x, y);
			}
			ctx.fillStyle = this.getEffectFillStyle(ctx);
			ctx.fillText(this.watermarkSettings.text, x, y);
		}
	}

	/**
	 * Render a single watermark instance at specified coordinates with rotation.
	 *
	 * PERFORMANCE CRITICAL: This function is called for every tile in pattern layouts.
	 * Optimizations include intelligent caching and precision content extraction.
	 *
	 * RENDERING STRATEGY:
	 * 1. CACHE PATH (Fast): Use pre-rendered offscreen canvas when available
	 * 2. FALLBACK PATH (Slow): Direct rendering for edge cases
	 *
	 * @param {CanvasRenderingContext2D} ctx - Target canvas context
	 * @param {number} x - X coordinate for watermark center
	 * @param {number} y - Y coordinate for watermark center
	 * @param {number} angle - Rotation angle in degrees
	 */
	drawRotatedWatermark(ctx, x, y, angle) {
		/*
		 * FAST PATH: Use cached pre-rendered watermark.
		 * This path provides 10-100x performance improvement for dense patterns.
		 */
		if (this._watermarkCache && this._watermarkCache.canvas) {
			const cache = this._watermarkCache;

			// Setup transformation matrix for rotation and positioning
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate((angle * Math.PI) / 180);

			/*
			 * PRECISION CONTENT EXTRACTION: Draw only visible content area.
			 * Excludes cache padding to ensure perfect edge-to-edge tile alignment.
			 */
			const srcPad = cache.pad ? cache.pad : 0;
			let srcW = cache.contentW || cache.w; // Content width (no padding)
			let srcH = cache.contentH || cache.h; // Content height (no padding)

			// Safety bounds: ensure non-zero dimensions
			srcW = Math.max(1, Math.round(srcW));
			srcH = Math.max(1, Math.round(srcH));

			// Calculate exact source coordinates within cached canvas
			const realSrcX = cache.pad ? cache.pad : Math.round((cache.w - srcW) / 2);
			const realSrcY = cache.pad ? cache.pad : Math.round((cache.h - srcH) / 2);

			/*
			 * FALLBACK SAFETY: If content area is too small (calculation error),
			 * draw the full cache to prevent rendering failure.
			 */
			if (srcW <= 2 || srcH <= 2) {
				ctx.drawImage(cache.canvas, -cache.w / 2, -cache.h / 2, cache.w, cache.h);
				ctx.restore();
				return;
			}

			// Draw precise content area centered at origin
			ctx.drawImage(cache.canvas, realSrcX, realSrcY, srcW, srcH, -srcW / 2, -srcH / 2, srcW, srcH);

			// Debug logging for spacing issues
			console.log("Drawing watermark from cache:", {
				srcW: srcW,
				srcH: srcH,
				cacheContentW: cache.contentW,
				cacheContentH: cache.contentH,
				realSrcX: realSrcX,
				realSrcY: realSrcY,
				x: x,
				y: y,
			});

			ctx.restore();
			return;
		}

		/*
		 * FALLBACK PATH: Direct rendering without cache.
		 * Should be rare since cache is built during pattern initialization.
		 * Provides compatibility when cache building fails.
		 */
		if (this.watermarkSettings.type === "text") {
			// Direct text rendering with reduced font size for pattern context
			const fontSize = Math.max(8, (this.watermarkSettings.fontSize * 600) / 800);
			ctx.font = `${fontSize}px ${this.watermarkSettings.fontFamily}`;
			ctx.textBaseline = "middle";
			ctx.textAlign = "center";

			ctx.save();
			ctx.translate(x, y);
			ctx.rotate((angle * Math.PI) / 180);

			// Apply all text effects (shadows, glows, etc.)
			this.applyTextEffects(ctx);
			ctx.fillStyle = this.getEffectFillStyle(ctx);
			ctx.fillText(this.watermarkSettings.text, 0, 0);
			ctx.restore();
		} else if (this.watermarkSettings.type === "logo" && this.watermarkSettings.watermarkLogo) {
			// Direct logo rendering with simplified scaling
			const img = this.watermarkSettings.watermarkLogo;
			const scale = this.getLogoScaleFraction();
			const size = Math.min(600, 600) * scale * 0.3; // Reduced size for patterns
			const ratio = Math.min(size / img.width, size / img.height);
			const width = img.width * ratio;
			const height = img.height * ratio;

			ctx.save();
			ctx.translate(x, y);
			ctx.rotate((angle * Math.PI) / 180);

			// Apply transparency if specified
			ctx.globalAlpha = this.watermarkSettings.opacity;
			ctx.drawImage(img, -width / 2, -height / 2, width, height);
			ctx.restore();
		}
	}

	/**
	 * Build optimized watermark cache for pattern rendering performance.
	 *
	 * PURPOSE: Pre-render watermark content to offscreen canvas for dramatic performance improvement.
	 * Creates reusable bitmap that eliminates complex text/logo rendering during tile drawing.
	 *
	 * CACHE STRATEGY:
	 * - Quantized Size Keys: Groups similar canvas sizes to maximize cache reuse
	 * - Content-Aware Keys: Includes text/logo content and styling in cache key
	 * - Map-Based Storage: Maintains multiple caches for different configurations
	 *
	 * PERFORMANCE IMPACT: 10-100x speedup for dense patterns (100+ tiles)
	 * Memory optimization: Limited cache size with automatic cleanup
	 *
	 * @param {CanvasRenderingContext2D} ctx - Reference context (for font metrics)
	 * @param {number} canvasWidth - Target canvas width
	 * @param {number} canvasHeight - Target canvas height
	 */
	buildWatermarkCache(ctx, canvasWidth, canvasHeight) {
		try {
			/*
			 * QUANTIZATION STRATEGY: Group similar canvas sizes to improve cache hit rates.
			 * Reduces unique cache entries by grouping dimensions into 50px buckets.
			 */
			const QUANTIZE = 50; // 50px buckets
			const qW = Math.max(1, Math.round(canvasWidth / QUANTIZE) * QUANTIZE);
			const qH = Math.max(1, Math.round(canvasHeight / QUANTIZE) * QUANTIZE);

			/*
			 * CACHE KEY GENERATION: Create unique identifier including all relevant settings.
			 * Ensures cache is invalidated when any visual parameter changes.
			 */
			const keyObj = {
				type: this.watermarkSettings.type, // "text" or "logo"
				text: this.watermarkSettings.text, // Text content
				fontSize: this.watermarkSettings.fontSize, // Font size
				fontFamily: this.watermarkSettings.fontFamily, // Font family
				logoScale: this.watermarkSettings.logoScale, // Logo scale percentage
				textColor: this.watermarkSettings.textColor, // Text color
				overlayEffect: this.watermarkSettings.overlayEffect, // Shadow/outline effects
				qW, // Quantized width
				qH, // Quantized height
				canvasWidth, // Actual canvas width
				canvasHeight, // Actual canvas height
			};

			/*
			 * LOGO-SPECIFIC CACHE KEYS: Include logo dimensions to prevent
			 * cache reuse between different logo images.
			 */
			if (this.watermarkSettings.type === "logo" && this.watermarkSettings.watermarkLogo) {
				try {
					const logoImg = this.watermarkSettings.watermarkLogo;
					keyObj.logoW = logoImg.width || 0;
					keyObj.logoH = logoImg.height || 0;
				} catch (e) {
					// Ignore logo dimension extraction errors
				}
			}
			const cacheKey = JSON.stringify(keyObj);

			/*
			 * CACHE LOOKUP: Check if cache already exists for this configuration.
			 * Map-based storage provides O(1) lookup performance.
			 */
			const existingCache = this._watermarkCacheMap.get(cacheKey);
			if (existingCache) {
				this._watermarkCache = existingCache; // Set active cache reference
				return;
			}

			/*
			 * CACHE BUILDING: Create new offscreen canvas with optimized content rendering.
			 * Only executed when cache miss occurs - expensive but amortized across tile pattern.
			 */

			/*
			 * DIMENSION ESTIMATION: Calculate optimal cache canvas size.
			 * Must match actual rendered size to prevent scaling artifacts.
			 */
			let estW = 100; // Default text width estimate
			let estH = 40; // Default text height estimate

			if (this.watermarkSettings.type === "text") {
				// Precise text dimension calculation using canvas metrics
				const fontSize = Math.max(12, (this.watermarkSettings.fontSize * canvasWidth) / 800);
				const tmpFont = `${fontSize}px ${this.watermarkSettings.fontFamily}`;
				ctx.font = tmpFont;
				const metrics = ctx.measureText(this.watermarkSettings.text || "Watermark");

				// Use measured width or fallback estimation
				estW =
					metrics.width ||
					fontSize * (this.watermarkSettings.text ? this.watermarkSettings.text.length * 0.6 : 4);
				estH = Math.ceil(fontSize * 1.1); // Line height approximation
			} else if (this.watermarkSettings.type === "logo" && this.watermarkSettings.watermarkLogo) {
				// Logo dimension calculation matching actual rendering logic
				const img = this.watermarkSettings.watermarkLogo;
				const scale = this.getLogoScaleFraction();

				/*
				 * SCALING ALGORITHM: Match logo rendering size calculation.
				 * Ensures cache dimensions exactly match final rendered dimensions.
				 */
				const maxSize = Math.min(canvasWidth, canvasHeight) * scale;
				let imgRatio = Math.min(maxSize / Math.max(1, img.width), maxSize / Math.max(1, img.height));
				imgRatio = Math.max(imgRatio, 0.02); // Minimum 2% scale to prevent invisibility
				estW = Math.ceil(img.width * imgRatio);
				estH = Math.ceil(img.height * imgRatio);
				/* Ensure estimated cache footprint is at least a few pixels to avoid zero-sized caches */
				const MIN_VISIBLE_PX = 6;
				if (estW < MIN_VISIBLE_PX) estW = MIN_VISIBLE_PX;
				if (estH < MIN_VISIBLE_PX) estH = MIN_VISIBLE_PX;
			}

			// Add a small padding for shadow/glow effects
			const pad = Math.ceil(Math.max(estW, estH) * 0.15) + 4;
			const c = document.createElement("canvas");
			c.width = Math.ceil(estW + pad * 2);
			c.height = Math.ceil(estH + pad * 2);
			const cctx = c.getContext("2d");
			cctx.clearRect(0, 0, c.width, c.height);

			if (this.watermarkSettings.type === "text") {
				const fontSize = Math.max(12, (this.watermarkSettings.fontSize * canvasWidth) / 800);
				cctx.font = `${fontSize}px ${this.watermarkSettings.fontFamily}`;
				cctx.textBaseline = "middle";
				cctx.textAlign = "center";
				this.applyTextEffects(cctx);
				cctx.fillStyle = this.getEffectFillStyle(cctx);
				cctx.fillText(this.watermarkSettings.text, c.width / 2, c.height / 2);
			} else if (this.watermarkSettings.type === "logo" && this.watermarkSettings.watermarkLogo) {
				const img = this.watermarkSettings.watermarkLogo;
				const scale = this.getLogoScaleFraction();
				const maxSize = Math.min(canvasWidth, canvasHeight) * scale;
				let ratio = Math.min(maxSize / img.width, maxSize / img.height);
				ratio = Math.max(ratio, 0.05);
				const w = img.width * ratio;
				const h = img.height * ratio;
				this.applyTextEffects(cctx);
				/* For logo watermarks, tint/gradient effects are handled by composite operations if chosen. */
				if (this.watermarkSettings.overlayEffect === "tint") {
					cctx.globalCompositeOperation = "source-atop";
					cctx.fillStyle = this.getEffectFillStyle(cctx);
					cctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
					cctx.fillRect((c.width - w) / 2, (c.height - h) / 2, w, h);
					// reset composite
					cctx.globalCompositeOperation = "source-over";
				} else {
					cctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
				}
			}

			const cacheEntry = {
				key: cacheKey,
				canvas: c,
				w: c.width,
				h: c.height,
				// contentW/contentH represent the watermark's visible content size (without extra cache padding)
				contentW: Math.ceil(estW),
				contentH: Math.ceil(estH),
				pad,
			};

			this._watermarkCacheMap.set(cacheKey, cacheEntry);
			this._watermarkCache = cacheEntry; /* quick reference */
		} catch (err) {
			console.warn("Failed to build watermark cache", err);
		}
	}

	/**
	 * Convert logo scale percentage (1-500) to decimal fraction (0.01-5.0).
	 *
	 * SCALING LOGIC: Logo scale setting represents percentage of canvas dimension.
	 * - 20% = logo sized to 20% of smaller canvas dimension
	 * - 100% = logo sized to full canvas dimension
	 * - 500% = logo can be 5x larger than canvas (for artistic effects)
	 *
	 * SAFETY MEASURES: Validates input and applies reasonable bounds to prevent
	 * invisible logos (too small) or memory issues (too large).
	 *
	 * @returns {number} Scale factor as decimal (e.g., 0.2 for 20%)
	 */
	getLogoScaleFraction() {
		// Extract and validate scale value from settings
		let s = Number(this.watermarkSettings.logoScale);

		// Fallback to 20% for invalid/missing values
		if (!isFinite(s) || s <= 0) s = 20;

		// Apply safety bounds: 1% minimum, 500% maximum
		s = Math.max(1, Math.min(500, s));

		// Convert percentage to decimal fraction
		return s / 100;
	}

	drawLogoWatermark(ctx, canvasWidth, canvasHeight, position) {
		const img = this.watermarkSettings.watermarkLogo;
		const scale = this.getLogoScaleFraction();
		const maxSize = Math.min(canvasWidth, canvasHeight) * scale;
		let ratio = Math.min(maxSize / img.width, maxSize / img.height);
		/* Ensure ratio is not zero; clamp to tiny epsilon to keep logo visible */
		ratio = Math.max(ratio, 0.02); /* allow smaller ratio for cache but we'll enforce visible px later */
		const width = img.width * ratio;
		const height = img.height * ratio;

		let x = canvasWidth * position.x;
		let y = canvasHeight * position.y;

		/* Ensure logo watermark stays inside canvas bounds with tighter padding */
		const maxLogoSize = Math.min(canvasWidth, canvasHeight) * this.getLogoScaleFraction();
		let logoWidth = Math.min(width, maxLogoSize);
		let logoHeight = Math.min(height, maxLogoSize);

		/* Enforce a sensible minimum visible size (in px) to avoid invisible preview */
		/* due to rounding on small canvases or small source logos. Keep clip-safe minimum. */
		const MIN_VISIBLE_PX = 6;
		if (logoWidth < MIN_VISIBLE_PX || logoHeight < MIN_VISIBLE_PX) {
			/* Scale up proportionally to meet min visible threshold while preserving aspect */
			const scaleUp = MIN_VISIBLE_PX / Math.max(1, Math.max(logoWidth, logoHeight));
			logoWidth = Math.max(MIN_VISIBLE_PX, Math.round(logoWidth * scaleUp));
			logoHeight = Math.max(MIN_VISIBLE_PX, Math.round(logoHeight * scaleUp));
		}

		let padX = Math.min(12, Math.round(logoWidth * 0.05) + 4);
		let padY = Math.min(12, Math.round(logoHeight * 0.05) + 4);
		const singleMode = this.watermarkSettings.patternMode === "single";
		const isCorner = position.x <= 0.2 || position.x >= 0.8 || position.y <= 0.2 || position.y >= 0.8;
		if (singleMode && isCorner) {
			padX = 0;
			padY = 0;
		}

		if (position.x >= 0.8) {
			x = Math.min(canvasWidth - logoWidth - padX, x);
		} else if (position.x <= 0.2) {
			x = Math.max(padX, x);
		} else {
			x = x - logoWidth / 2;
		}

		if (position.y >= 0.8) {
			y = Math.min(canvasHeight - logoHeight - padY, y);
		} else if (position.y <= 0.2) {
			y = Math.max(padY, y);
		} else {
			y = y - logoHeight / 2;
		}

		/* Apply offsets */
		x += (this.watermarkSettings.offsetX * canvasWidth) / 800;
		y += (this.watermarkSettings.offsetY * canvasHeight) / 600;

		/* Apply rotation */
		if (this.watermarkSettings.watermarkRotation !== 0) {
			ctx.save();
			/* Use clamped logoWidth/logoHeight for translation so rotation centers correctly */
			ctx.translate(x + logoWidth / 2, y + logoHeight / 2);
			ctx.rotate((this.watermarkSettings.watermarkRotation * Math.PI) / 180);
			ctx.drawImage(
				img,
				-Math.max(logoWidth, 4) / 2,
				-Math.max(logoHeight, 4) / 2,
				Math.max(logoWidth, 4),
				Math.max(logoHeight, 4)
			);
			ctx.restore();
		} else {
			ctx.drawImage(img, x, y, Math.max(logoWidth, 4), Math.max(logoHeight, 4));
		}
	}

	applyTextEffects(ctx) {
		// Only apply these canvas-level effects for text watermarks
		if (this.watermarkSettings.type !== "text") return;

		const te = this.watermarkSettings.textEffects || {};

		// Helper: convert #rrggbb or #rgb to rgba string with alpha
		const hexToRgba = (hex, alpha = 1) => {
			let h = hex.replace("#", "");
			if (h.length === 3) {
				h = h
					.split("")
					.map((c) => c + c)
					.join("");
			}
			const bigint = parseInt(h, 16);
			const r = (bigint >> 16) & 255;
			const g = (bigint >> 8) & 255;
			const b = bigint & 255;
			return `rgba(${r}, ${g}, ${b}, ${alpha})`;
		};

		// Reset common shadow/composite values first to known defaults
		ctx.shadowColor = "transparent";
		ctx.shadowBlur = 0;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
		ctx.globalCompositeOperation = "source-over";

		// Shadow
		if (te.shadow) {
			ctx.shadowColor = te.shadowColor || "rgba(0,0,0,0.5)";
			ctx.shadowBlur = Number(te.shadowBlur) || 4;
			ctx.shadowOffsetX = Number(te.shadowOffsetX) || 2;
			ctx.shadowOffsetY = Number(te.shadowOffsetY) || 2;
		}

		// Glow uses a semi-strong shadow with glow color
		if (te.glow) {
			ctx.shadowColor = te.glowColor || this.watermarkSettings.textColor;
			ctx.shadowBlur = Number(te.glowBlur) || 12;
		}

		// Default fillStyle remains text color (gradient/tint removed as per requirement)
		ctx.fillStyle = this.watermarkSettings.textColor;
	}

	getEffectFillStyle(ctx) {
		// Always use the configured text color for fills. Effects that change appearance
		// are applied via shadow/blur or stroke; gradient/tint overlays were removed.
		return this.watermarkSettings.textColor;
	}

	/**
	 * Process all uploaded images with current watermark settings.
	 *
	 * BATCH PROCESSING WORKFLOW:
	 * 1. Validate loaded files
	 * 2. Setup UI for progress tracking
	 * 3. Process each image sequentially with progress updates
	 * 4. Handle errors gracefully (continue processing other images)
	 * 5. Setup download interface and auto-show modal
	 *
	 * PERFORMANCE CONSIDERATIONS:
	 * - Sequential processing prevents memory exhaustion
	 * - 100ms delay between images allows UI updates
	 * - Progress tracking provides user feedback
	 * - Error isolation ensures batch completion
	 */
	async processAllImages() {
		// Validate that we have images to process
		const loadedFiles = this.getLoadedFiles();
		if (loadedFiles.length === 0) {
			alert("No images loaded to process.");
			return;
		}

		/*
		 * UI SETUP: Prepare progress interface and disable controls.
		 * Prevents user interference during processing.
		 */
		const processBtn = document.getElementById("processBtn");
		const progressSection = document.getElementById("processingProgress");
		const progressFill = document.getElementById("progressFill");
		const progressText = document.getElementById("progressText");

		// Disable process button to prevent multiple concurrent operations
		if (processBtn) {
			processBtn.disabled = true;
			processBtn.textContent = "Processing...";
		}

		// Show progress section for user feedback
		if (progressSection) progressSection.classList.remove("hidden");

		// Clear any previous processed images
		this.processedImages = [];

		/*
		 * SEQUENTIAL PROCESSING LOOP: Process images one by one.
		 * Sequential approach prevents memory issues and allows progress tracking.
		 */
		for (let i = 0; i < loadedFiles.length; i++) {
			const fileData = loadedFiles[i];

			// Calculate and display progress percentage
			const progress = ((i + 1) / loadedFiles.length) * 100;
			if (progressFill) progressFill.style.width = progress + "%";
			if (progressText) progressText.textContent = `Processing ${i + 1} of ${loadedFiles.length} images...`;

			try {
				// Process individual image with current watermark settings
				const processedData = await this.processImage(fileData);
				this.processedImages.push(processedData);
			} catch (error) {
				// ERROR ISOLATION: Log error but continue with remaining images
				console.error(`Error processing ${fileData.name}:`, error);
				// Could add UI notification for failed images here
			}

			// Brief delay allows UI updates and prevents browser freezing
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		if (progressText) progressText.textContent = "Processing complete!";

		const downloadSection = document.getElementById("downloadSection");
		if (downloadSection) downloadSection.classList.remove("hidden");

		if (processBtn) {
			processBtn.disabled = false;
			processBtn.textContent = "Process All Images";
		}

		// AUTO-SHOW MODAL
		setTimeout(() => {
			try {
				if (this.modal && typeof this.modal.showModal === "function") {
					this.modal.showModal(this.processedImages);
				} else {
					console.warn("Modal instance missing or showModal not a function - creating fallback overlay");
					// create a simple fallback modal element
					const fallback = document.createElement("div");
					fallback.style.position = "fixed";
					fallback.style.top = "0";
					fallback.style.left = "0";
					fallback.style.width = "100%";
					fallback.style.height = "100%";
					fallback.style.background = "rgba(0,0,0,0.8)";
					fallback.style.display = "flex";
					fallback.style.alignItems = "center";
					fallback.style.justifyContent = "center";
					fallback.style.zIndex = 9999;
					fallback.innerHTML = `<div style='background:var(--color-surface); padding:24px; border-radius:8px; max-width:90vw; max-height:80vh; overflow:auto;'><h3>Processed Images</h3><p>${this.processedImages.length} images processed</p><button id='__fallbackClose'>Close</button></div>`;
					document.body.appendChild(fallback);
					document
						.getElementById("__fallbackClose")
						.addEventListener("click", () => document.body.removeChild(fallback));
				}
			} catch (e) {
				console.error("Failed to show modal:", e);
			}
		}, 1000);
	}

	processImage(fileData) {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement("canvas");
				const ctx = canvas.getContext("2d");

				canvas.width = img.width;
				canvas.height = img.height;

				ctx.drawImage(img, 0, 0);
				/* Before applying, rebuild or reuse cache for this image size and compute spacing */
				this.buildWatermarkCache(ctx, canvas.width, canvas.height);
				const spacing = this.computePatternSpacing(ctx, canvas.width, canvas.height);
				this.applyWatermark(ctx, canvas.width, canvas.height);

				canvas.toBlob(
					(blob) => {
						const processedName = `watermarked_${fileData.name}`;
						resolve({
							name: processedName,
							originalName: fileData.name,
							blob: blob,
							url: URL.createObjectURL(blob),
						});
					},
					"image/jpeg",
					0.9
				);
			};
			img.src = fileData.preview;
		});
	}

	async downloadZip() {
		if (this.processedImages.length === 0) {
			alert("No processed images to download.");
			return;
		}

		try {
			const zip = new JSZip();

			for (const imageData of this.processedImages) {
				zip.file(imageData.name, imageData.blob);
			}

			const zipBlob = await zip.generateAsync({ type: "blob" });

			const url = URL.createObjectURL(zipBlob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "watermarked_images.zip";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Error creating ZIP:", error);
			alert("Error creating ZIP file.");
		}
	}
}

/* Initialize when DOM is ready */
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", () => {
		new BulkWatermarkApp();
	});
} else {
	new BulkWatermarkApp();
}
