import fileUpload from '../assets/fileUpload.png'
import Navbar from '../layouts/navbar';
import Footer from '../layouts/footer';
import Toolbar from './Toolbar';
import StatusBar from './StatusBar';
import TrueFocus from './TrueFocus';
import AnnotationEditor from './AnnotationEditor';
import FileDropZone from '../components/FileDropZone.js'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.entry';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { uploadPDF, getGeoJSON, updateAnnotation, deleteAnnotation, healthCheck, getClassMappings, storeGeoJSONInDb } from '../services/api';
import React, { useState, useEffect, useRef, useCallback } from 'react';


pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Configuration constants
const DEFAULT_GEOJSON_FILE = 'annotations_page_1.geojson';
const TARGET_WIDTH = 9934;
const TARGET_HEIGHT = 7017;

const LandingPage = () => {

    const [pdfFile, setPdfFile] = useState(null);
    const [pdfURL, setPdfURL] = useState(null);
    const [pdfDoc, setPdfDoc] = useState(null);
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [result, setResult] = useState(null);
    const [selectedAnnotation, setSelectedAnnotation] = useState(null);
    const [editText, setEditText] = useState('');
    const [zoomLevel, setZoomLevel] = useState(1);
    const [pdfRendered, setPdfRendered] = useState(false);
    const [dbReady, setDbReady] = useState(false);
    const [annotations, setAnnotations] = useState([]);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isRendering, setIsRendering] = useState(false);
    const [pendingUpdates, setPendingUpdates] = useState([]); // Track label updates
    const [pendingDeletes, setPendingDeletes] = useState([]); // Track deletions
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [classMappings, setClassMappings] = useState({});
    const [mappingsLoaded, setMappingsLoaded] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [compareResults, setCompareResults] = useState(null);
    const [uploadedExcelFile, setUploadedExcelFile] = useState(null);
    const fileInputRef = useRef();
    // Refs
    const canvasRef = useRef(null);
    const svgOverlayRef = useRef(null);
    const containerRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const renderTimeoutRef = useRef(null);

    const pdfInfoRef = useRef({
        page: null,
        baseScale: 1,
        originalWidth: 0,
        originalHeight: 0,
        baseCanvasWidth: 0,
        baseCanvasHeight: 0
    });

    const classDisplayNames = {
        0: "Field-Mounted Instrument",
        1: "Air-Supply Connection Required",
        2: "Panel-Mounted Instrument",
        3: "SCADA",
        4: "4",
        5: "5",
        6: "Double block‐and‐bleed valve",
        7: "manual handwheel",
        8: "bleed port",
        9: "Double‐seated valve",
        10: "Double‐seated control valve  with bypass",
        11: "Double‐seated control valve (solid) without bypass",
        12: "Double‐seated control valve (outline) without bypass",
        13: "Double‐seated control valve with positioner",
        14: "Double‐seated control valve with bypass (solid fill)",
        15: "Double‐seated control valve with positioner and bypass",
        16: "Double‐Block‐and‐Bleed Valve",
        17: "Double‐Block‐and‐Bleed Valve with Bypas",
        18: "Check Valve",
        19: "SCADA System Operator",
        20: "Instrument Terminal"
    };



    const handleCompareFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            setStatusMessage("Error: Please upload an Excel file (.xlsx or .xls)");
            return;
        }

        setStatusMessage("Excel file selected. Click 'Compare PDF' to compare.");
        setUploadedExcelFile(file);
    };

    const handleCompareClick = async () => {
        if (!uploadedExcelFile) {
            setStatusMessage("Please upload a Bill/Excel file first.");
            return;
        }

        setStatusMessage("Comparing with database...");
        setLoading(true);

        try {
            // First, get the database data
            const dbResponse = await fetch("http://localhost:8000/api/compare-excel/");
            if (!dbResponse.ok) {
                throw new Error("Failed to fetch database data");
            }
            const dbData = await dbResponse.json();
            
            if (dbData.error) {
                throw new Error(dbData.error);
            }

            // Read the Excel file
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const excelData = XLSX.utils.sheet_to_json(firstSheet);

                    // Validate Excel data
                    const requiredCols = ['component_name', 'class_id', 'count'];
                    const missingCols = requiredCols.filter(col => !excelData[0] || !(col in excelData[0]));
                    if (missingCols.length > 0) {
                        throw new Error(`Missing required columns: ${missingCols.join(', ')}`);
                    }

                    // Compare data
                    const results = excelData.map(row => {
                        const dbRow = dbData.results.find(
                            db => db.component_name === row.component_name && 
                                 db.class_id === row.class_id
                        );

                        const match = dbRow && dbRow.count === row.count;
                        const difference = dbRow ? dbRow.count -row.count : null;

                        return {
                            component_name: row.component_name,
                            class_id: row.class_id,
                            count_file: row.count,
                            count_db: dbRow ? dbRow.count : null,
                            match: match,
                            difference: difference
                        };
                    });

                    setCompareResults(results);
                    setStatusMessage("Comparison complete.");
                } catch (err) {
                    console.error("Excel processing error:", err);
                    setCompareResults(null);
                    setStatusMessage(`Error processing Excel file: ${err.message}`);
                } finally {
                    setLoading(false);
                }
            };

            reader.onerror = () => {
                setStatusMessage("Error reading Excel file");
                setLoading(false);
            };

            reader.readAsArrayBuffer(uploadedExcelFile);

        } catch (err) {
            console.error("Comparison error:", err);
            setCompareResults(null);
            setStatusMessage(`Error: ${err.message}`);
            setLoading(false);
        }
    };

    const renderPDFAtQuality = useCallback(async (targetZoom = zoomLevel) => {
        if (!pdfInfoRef.current.page || !canvasRef.current || isRendering) return;

        setIsRendering(true);

        try {
            const page = pdfInfoRef.current.page;
            const canvas = canvasRef.current;

            // Calculate rendering scale
            const qualityMultiplier = Math.max(2, targetZoom * 1.5);
            const renderScale = pdfInfoRef.current.baseScale * qualityMultiplier;

            // Get viewport for rendering
            const renderViewport = page.getViewport({ scale: renderScale });

            // Set canvas internal size for quality
            canvas.width = renderViewport.width;
            canvas.height = renderViewport.height;

            const ctx = canvas.getContext('2d', { alpha: false });
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';



            // Clear and render
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            await page.render({
                canvasContext: ctx,
                viewport: renderViewport,
                intent: 'display',
                renderInteractiveForms: true,
                annotationMode: 2
            }).promise;

        } catch (error) {
            console.error('Error rendering PDF:', error);
        } finally {
            setIsRendering(false);
        }
    }, [zoomLevel, isRendering]);

    // Debounced quality enhancement
    const enhanceQualityDebounced = useCallback((targetZoom) => {
        if (renderTimeoutRef.current) {
            clearTimeout(renderTimeoutRef.current);
        }

        renderTimeoutRef.current = setTimeout(() => {
            renderPDFAtQuality(targetZoom);
        }, 200);
    }, [renderPDFAtQuality]);

    const performZoom = useCallback((newZoom, centerPoint = null) => {
        const actualNewZoom = Math.max(0.2, Math.min(5, newZoom));

        if (actualNewZoom === zoomLevel) return;

        // If no center point provided, use container center
        if (!centerPoint && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            centerPoint = {
                x: rect.width / 2,
                y: rect.height / 2
            };
        }

        // Calculate new pan offset to keep zoom centered
        if (centerPoint) {
            const zoomRatio = actualNewZoom / zoomLevel;
            const newPanOffset = {
                x: centerPoint.x - (centerPoint.x - panOffset.x) * zoomRatio,
                y: centerPoint.y - (centerPoint.y - panOffset.y) * zoomRatio
            };
            setPanOffset(newPanOffset);
        }

        setZoomLevel(actualNewZoom);

        // Enhance quality for high zoom levels
        if (actualNewZoom > 1.2) {
            enhanceQualityDebounced(actualNewZoom);
        }
    }, [zoomLevel, panOffset, enhanceQualityDebounced]);

    // Zoom handlers
    const handleZoomIn = useCallback(() => {
        performZoom(zoomLevel * 1.25);
    }, [zoomLevel, performZoom]);

    const handleZoomOut = useCallback(() => {
        performZoom(zoomLevel / 1.25);
    }, [zoomLevel, performZoom]);

    const handleResetZoom = useCallback(() => {
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
        setTimeout(() => renderPDFAtQuality(1), 100);
    }, [renderPDFAtQuality]);

    // Mouse event handlers
    const getMousePosition = (e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };

        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const handleMouseDown = (e) => {
        if (e.ctrlKey || e.metaKey) return;

        setIsDragging(true);
        const mousePos = getMousePosition(e);
        setDragStart({
            x: mousePos.x - panOffset.x,
            y: mousePos.y - panOffset.y
        });
        e.preventDefault();
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;

        const mousePos = getMousePosition(e);
        setPanOffset({
            x: mousePos.x - dragStart.x,
            y: mousePos.y - dragStart.y
        });
        e.preventDefault();
    };

    const handleMouseUp = (e) => {
        setIsDragging(false);
        e.preventDefault();
    };

    const handleWheel = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const mousePos = getMousePosition(e);
        const delta = e.deltaY;
        const zoomFactor = delta > 0 ? 0.9 : 1.1;
        const newZoom = zoomLevel * zoomFactor;

        performZoom(newZoom, mousePos);
    };

    const [classIds, setClassIds] = useState([]);
    const [visibleClasses, setVisibleClasses] = useState(new Set());

    const toggleClass = (id) => {
        setVisibleClasses(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const loadClassMappings = async () => {
        try {
            const response = await getClassMappings();
            if (response.error) {
                console.error('Failed to load class mappings');
                // Fallback to prevent crashes
                setClassMappings({ 1: "1", 2: "2", 3: "3" });
            } else {
                setClassMappings(response.data.mappings);
                console.log('✅ Loaded class mappings from backend');
            }
        } catch (error) {
            console.error('Error loading class mappings:', error);
            setClassMappings({ 1: "1", 2: "2", 3: "3" }); // minimal fallback
        } finally {
            setMappingsLoaded(true);
        }
    };

    const handleUpdateAnnotation = async () => {
        if (!selectedAnnotation) return;

        // 1) Prepare the payload
        const matchClassId = selectedAnnotation.class_id;
        const matchConfidence = parseFloat(selectedAnnotation.confidence.toFixed(4));
        const classIdMatch = editText.match(/^(\d+)/);
        const newClassId = classIdMatch ? parseInt(classIdMatch[1], 10) : matchClassId;

        const updatePayload = {
            match_class_id: matchClassId,
            match_confidence: matchConfidence,
            new_class_id: newClassId,
            renamed_name: `Class ${newClassId}`  // Use class ID format
        };

        // 2) Optimistically update in‐memory state
        setAnnotations(prev =>
            prev.map(ann =>
                ann.id === selectedAnnotation.id
                    ? {
                        ...ann,
                        class_id: newClassId,
                        label: `Class ${newClassId} (${ann.confidence.toFixed(4)})`,
                        renamed_name: `Class ${newClassId}`
                    }
                    : ann
            )
        );
        setHasUnsavedChanges(true);

        // 3) Call your API to persist
        try {
            const filename = 'annotations_page_1.geojson';
            const pdfId = result?.pdf_id || null;                 // pass null will use filename
            const res = await updateAnnotation(filename, updatePayload, pdfId);

            if (res.error) throw new Error(res.error.message);

            setStatusMessage(
                `✅ Saved! DB rows updated: ${res.db_updated}, file features updated: ${res.file_updated}`
            );
            setHasUnsavedChanges(false);
        } catch (err) {
            console.error('Update failed:', err);
            setStatusMessage(`❌ Update failed: ${err.message}`);
            // (optionally roll back your optimistic update here)
        }

        setVisibleClasses(prev => {
            const next = new Set(prev);
            next.add(newClassId);
            return next;
        });
        // 4) Close editor
        setSelectedAnnotation(null);
    };


    const handleDeleteAnnotation = async () => {
        if (!selectedAnnotation) return;

        const payload = {
            match_class_id: selectedAnnotation.class_id,
            match_confidence: selectedAnnotation.confidence
        };

        try {
            await deleteAnnotation(DEFAULT_GEOJSON_FILE, payload, result.pdf_id);

            // remove from local state so it disappears from the overlay
            setAnnotations(prev =>
                prev.filter(ann => ann.id !== selectedAnnotation.id)
            );

            setStatusMessage('✅ Annotation deleted');
        } catch (err) {
            console.error('Delete failed', err);
            setStatusMessage('❌ Failed to delete annotation');
        } finally {
            setSelectedAnnotation(null);
        }
    };

    const handleUploadOnly = async () => {
        // 1. Make sure a file is selected
        if (!pdfFile) {
            setStatusMessage("Please upload a PDF file first.");
            return;
        }

        // 2. Turn on your spinner/UI lock
        setLoading(true);
        setStatusMessage("Uploading PDF…");

        try {
            // 3. Call your upload helper
            const uploadResult = await uploadPDF(pdfFile);

            // 4. If the helper reports an error, throw to catch block
            if (uploadResult.error) {
                throw new Error(uploadResult.error.message || "Unknown upload error");
            }

            // 5. On success, store the returned data in state
            setResult(uploadResult.data);
            setDbReady(true);
            
            // Show appropriate message based on whether PDF was existing or new
            if (uploadResult.data.is_existing) {
                setStatusMessage(`PDF already exists (ID: ${uploadResult.data.pdf_id}). Processed image updated.`);
            } else {
                setStatusMessage(`New PDF uploaded successfully! PDF ID = ${uploadResult.data.pdf_id}`);
            }

            // Reset annotations state
            setAnnotations([]);
            setSelectedAnnotation(null);
            setEditText('');
            setHasUnsavedChanges(false);
            setPendingUpdates([]);
            setPendingDeletes([]);

        } catch (err) {
            console.error("Upload failed:", err);
            setStatusMessage(`Upload failed: ${err.message}`);
        } finally {
            // 6. Always turn off loading
            setLoading(false);
        }
    };


    const processPDF = async () => {
        if (!pdfFile) {
            setStatusMessage('Please upload a PDF file.');
            return;
        }

        setLoading(true);

        // If PDF is already processed, ONLY save changes to database (don't reload)
        if (result && result.pdf_id && dbReady) {
            if (hasUnsavedChanges) {
                await syncChangesToDatabase();
            } else {
                setStatusMessage('No changes to save. Database is up to date.');
            }
            setLoading(false);
            return; // EXIT HERE - don't reload from database
        }

        // First time processing - only for new PDFs
        setStatusMessage('Uploading and processing PDF...');

        try {
            const healthCheckResult = await healthCheck();
            if (healthCheckResult.error) {
                throw new Error(`Backend not responding: ${healthCheckResult.error.message}`);
            }

            const uploadResult = await uploadPDF(pdfFile);

            if (uploadResult.error) {
                throw new Error(`Upload failed: ${uploadResult.error.message}`);
            }

            setResult(uploadResult.data);
            setDbReady(true);

            // ONLY load annotations for NEW PDFs, not existing ones
            if (uploadResult.data.pages && uploadResult.data.pages.length > 0) {
                const page = uploadResult.data.pages[0];
                if (page.geojson_url) {
                    try {
                        const geojsonResponse = await getGeoJSON(
                            page.geojson_url.split('/').pop(),
                            uploadResult.data.pdf_id
                        );

                        if (!geojsonResponse.error) {
                            const processedAnnotations = processAnnotations(geojsonResponse.data);
                            setAnnotations(processedAnnotations);
                            setResult(prev => ({
                                ...prev,
                                pages: [{ ...prev.pages[0], geojson: geojsonResponse.data }]
                            }));
                        }
                    } catch (annotationError) {
                        console.error('Error loading annotations:', annotationError);
                    }
                }
            }

            setStatusMessage('PDF processed successfully! Make changes and click "Process PDF" to save to database.');

        } catch (error) {
            console.error('Process error:', error);
            setStatusMessage(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Convert GeoJSON coordinates to screen coordinates
    const convertToScreenCoords = useCallback((geoCoords) => {
        if (!pdfInfoRef.current.baseCanvasWidth) return geoCoords;

        const { baseCanvasWidth, baseCanvasHeight } = pdfInfoRef.current;
        const scaleX = baseCanvasWidth / TARGET_WIDTH;
        const scaleY = baseCanvasHeight / TARGET_HEIGHT;

        return geoCoords.map(([x, y]) => [
            x * scaleX,
            y * scaleY
        ]);
    }, []);

    // Handle annotation click
    const handleAnnotationClick = (annotation, e) => {
        e.stopPropagation();
        setSelectedAnnotation(annotation);
        setEditText(annotation.label);
    };

    // const handleAddGeojson = async () => {
    //     setStatusMessage('Loading static GeoJSON…');
    //     try {
    //         const res = await fetch('/annotations_page_1.geojson');
    //         if (!res.ok) throw new Error(`HTTP ${res.status}`);
    //         const geojson = await res.json();

    //         // processAnnotations is your existing helper
    //         const processedAnnotations = processAnnotations(geojson);

    //         // update state so your SVG overlay will render it
    //         setResult(prev => ({
    //             ...prev,
    //             pages: [{ ...prev?.pages?.[0], geojson }]
    //         }));
    //         setAnnotations(processedAnnotations);
    //         console.log('Static GeoJSON loaded:', geojson);
    //         setStatusMessage('GeoJSON added successfully');
    //     } catch (err) {
    //         console.error('Error loading static GeoJSON:', err);
    //         setStatusMessage('Error: Could not load GeoJSON');
    //     }
    // };

    const handleAddGeojson = async () => {
        setStatusMessage('Fetching GeoJSON from backend...');
        try {
            const response = await getGeoJSON("annotations_page_1.geojson", result?.pdf_id);

            if (response.error) {
                throw new Error(response.error.message || "Unknown error");
            }

            const geojson = response.data;
            const processedAnnotations = processAnnotations(geojson);

            setResult(prev => ({
                ...prev,
                pages: [{ ...prev?.pages?.[0], geojson }]
            }));
            setAnnotations(processedAnnotations);
            console.log("GeoJSON from backend:", geojson);

            setStatusMessage('GeoJSON added successfully');
        } catch (error) {
            console.error('Failed to fetch GeoJSON:', error);
            setStatusMessage('Error: Could not load GeoJSON');
        }
    };


    const processAnnotations = (geojson) => {
        if (!geojson?.features) return [];

        return geojson.features.map((feature, index) => {
            const { geometry, properties } = feature;

            if (!geometry?.coordinates?.[0]) return null;

            const classId = properties.class_id;
            const confidenceValue = parseFloat(properties.confidence);
            const confidenceDisplay = isNaN(confidenceValue) ? "N/A" : confidenceValue.toFixed(4);

            // Show only class ID and confidence in the label
            const labelText = `Class ${classId} (${confidenceDisplay})`;

            return {
                id: properties.annotation_id || `annotation-${index}`,
                coordinates: geometry.coordinates[0],
                class_id: classId,
                confidence: confidenceValue,
                label: labelText,
                properties
            };
        }).filter(Boolean);
    };

    const handleFileSelection = (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        if (pdfURL) {
            URL.revokeObjectURL(pdfURL);
        }

        setPdfFile(selectedFile);
        const objectUrl = URL.createObjectURL(selectedFile);
        setPdfURL(objectUrl);
        setPdfRendered(false);
        setStatusMessage(`Selected ${selectedFile.name}. Ready to process.`);

        // Reset states for new file
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
        setAnnotations([]);
        setResult(null);
        setDbReady(false); // Reset database ready state
    };

    const downloadAnnotations = () => {
        const link = document.createElement('a');
        link.href = 'http://localhost:8000/api/download-annotations';
        link.download = 'annotations_export.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    const syncChangesToDatabase = async () => {
        if (!result?.pdf_id) {
            setStatusMessage('No PDF loaded');
            return;
        }

        let totalChanges = 0;

        try {
            // Process all pending updates
            if (pendingUpdates.length > 0) {
                setStatusMessage(`Saving ${pendingUpdates.length} label updates to database...`);

                for (const update of pendingUpdates) {
                    const updateResult = await updateAnnotation(
                        "annotations_page_1.geojson",
                        update,
                        result.pdf_id
                    );

                    if (updateResult.error) {
                        console.error('Update failed:', updateResult.error);
                    } else {
                        totalChanges++;
                    }
                }
            }

            // Process all pending deletions
            if (pendingDeletes.length > 0) {
                setStatusMessage(`Deleting ${pendingDeletes.length} annotations from database...`);

                for (const deleteItem of pendingDeletes) {
                    const deleteResult = await deleteAnnotation(
                        "annotations_page_1.geojson",
                        deleteItem,
                        result.pdf_id
                    );

                    if (deleteResult.error) {
                        console.error('Delete failed:', deleteResult.error);
                    } else {
                        totalChanges++;
                    }
                }
            }

            // Clear pending changes
            setPendingUpdates([]);
            setPendingDeletes([]);
            setHasUnsavedChanges(false);

            setStatusMessage(`✅ Successfully saved ${totalChanges} changes to database!`);

        } catch (error) {
            console.error('Sync error:', error);
            setStatusMessage(`Error saving changes: ${error.message}`);
        }
    };

    const handleSaveAnnotationsToDb = async () => {
        if (!result?.pdf_id) {
            setStatusMessage('No PDF loaded');
            return;
        }

        setLoading(true);
        setStatusMessage('Saving annotations to database...');

        try {
            // Get the current GeoJSON data from the result state
            const geojsonData = result.pages[0].geojson;

            // Call the API to store in database
            const response = await storeGeoJSONInDb(result.pdf_id, 1, geojsonData);

            if (response.error) {
                throw new Error(response.error);
            }

            setStatusMessage('✅ Annotations saved to database successfully!');
            setHasUnsavedChanges(false);
        } catch (error) {
            console.error('Failed to save annotations:', error);
            setStatusMessage(`❌ Failed to save annotations: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!pdfURL) return;

        const loadPDF = async () => {
            try {
                setStatusMessage('Loading PDF document...');
                const loadingTask = pdfjsLib.getDocument(pdfURL);
                const pdf = await loadingTask.promise;
                setPdfDoc(pdf);
                setStatusMessage(`PDF loaded with ${pdf.numPages} pages. Ready to view.`);
            } catch (error) {
                console.error('Error loading PDF:', error);
                setStatusMessage(`Error loading PDF: ${error.message}`);
            }
        };

        loadPDF();

        return () => {
            if (pdfURL) {
                URL.revokeObjectURL(pdfURL);
            }
        };
    }, [pdfURL]);

    useEffect(() => {
        if (!pdfDoc || !canvasRef.current) return;

        let isComponentMounted = true;

        const renderPDF = async () => {
            try {
                setStatusMessage('Rendering PDF...');

                const page = await pdfDoc.getPage(1);
                const originalViewport = page.getViewport({ scale: 1.0 });

                console.log(`Original PDF dimensions: ${originalViewport.width}×${originalViewport.height}`);

                // Use default container size if container not ready
                const containerWidth = scrollContainerRef.current?.clientWidth || 800;
                const containerHeight = scrollContainerRef.current?.clientHeight || 600;

                // Calculate scale to fit PDF nicely
                const scaleX = (containerWidth - 40) / originalViewport.width;
                const scaleY = (containerHeight - 40) / originalViewport.height;
                const baseScale = Math.min(scaleX, scaleY) * 0.85; // 85% for margins

                // Calculate display dimensions
                const baseCanvasWidth = originalViewport.width * baseScale;
                const baseCanvasHeight = originalViewport.height * baseScale;

                // Store PDF info
                pdfInfoRef.current = {
                    page,
                    baseScale,
                    originalWidth: originalViewport.width,
                    originalHeight: originalViewport.height,
                    baseCanvasWidth,
                    baseCanvasHeight
                };

                // Render PDF at good quality
                const canvas = canvasRef.current;
                const renderScale = baseScale * 2; // 2x for quality
                const renderViewport = page.getViewport({ scale: renderScale });

                // Set canvas size
                canvas.width = renderViewport.width;
                canvas.height = renderViewport.height;
                canvas.style.width = `${baseCanvasWidth}px`;
                canvas.style.height = `${baseCanvasHeight}px`;

                const ctx = canvas.getContext('2d', { alpha: false });
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                await page.render({
                    canvasContext: ctx,
                    viewport: renderViewport,
                    intent: 'display',
                    renderInteractiveForms: true,
                    annotationMode: 2,
                }).promise;

                if (!isComponentMounted) return;

                setPdfRendered(true);
                setStatusMessage('PDF rendered successfully');

            } catch (error) {
                console.error('Error rendering PDF:', error);
                setStatusMessage(`Error rendering PDF: ${error.message}`);
            }
        };

        // Small delay to ensure DOM is ready
        const timeoutId = setTimeout(renderPDF, 100);

        return () => {
            isComponentMounted = false;
            clearTimeout(timeoutId);
        };
    }, [pdfDoc]);


    // Effect to update annotations when result changes
    useEffect(() => {
        if (pdfRendered && result?.pages?.[0]?.geojson) {
            const processedAnnotations = processAnnotations(result.pages[0].geojson);
            setAnnotations(processedAnnotations);
            setStatusMessage(`PDF displayed with ${processedAnnotations.length} annotations.`);
        }
    }, [result?.pages?.[0]?.geojson, pdfRendered]);

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            if (pdfURL) {
                URL.revokeObjectURL(pdfURL);
            }
            if (renderTimeoutRef.current) {
                clearTimeout(renderTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        loadClassMappings();
    }, []);

    useEffect(() => {
        // get all unique IDs
        const ids = Array.from(new Set(annotations.map(a => a.class_id)));
        setClassIds(ids);

        // on first annotation load, default to show all
        if (visibleClasses.size === 0 && ids.length > 0) {
            setVisibleClasses(new Set(ids));
        }
    }, [annotations]);

    // Add this new function to calculate class counts
    const getClassCount = (classId) => {
        return annotations.filter(a => a.class_id === classId).length;
    };

    // Add this new function before the return statement
    const downloadClassInfo = () => {
        // Prepare data for Excel
        const classData = classIds.map(id => ({
            'Class ID': id,
            'Class Name': classDisplayNames[id] || `Class ${id}`,
            'Count': getClassCount(id)
        }));

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(classData);

        // Create workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Class Information");

        // Generate Excel file
        XLSX.writeFile(wb, "class_information.xlsx");
    };

    // const [results, setResults] = useState([]);

    // useEffect(() => {
    //     axios.get('/api/getResults').then((res) => {
    //         setResults(res.data);
    //     });
    // }, [])

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            fontFamily: 'Arial, sans-serif'
        }}>
            <Navbar />

            <main style={{
                flex: 1,
                paddingTop: '8rem',
                textAlign: 'center'
            }}>
                {/* <h1 tyle={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
                    PDF Analyzer
                </h1> */}

                <TrueFocus
                    sentence="PDF Analyzer"
                    manualMode={false}
                    blurAmount={5}
                    borderColor="red"
                    animationDuration={0.5}
                    pauseBetweenAnimations={2}
                />
                <h2 style={{ fontSize: '1.5rem', fontFamily: 'monospace' }}>
                    Analyze PDFs. Detect Components. Annotate with Accuracy.
                </h2>


                <div>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            padding: '1rem',
                        }}
                    >
                        <div
                            style={{
                                width: '100%',
                                maxWidth: '600px',     // up to 600px wide
                                height: '250px',
                                marginBottom: '1rem',
                                padding: '1rem',
                                boxSizing: 'border-box',
                                border: '2px dashed #aaa',
                                borderRadius: '8px',
                                backgroundColor: '#f9f9f9',

                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',  // so the <input> can be absolute over it
                            }}
                        >
                            <label
                                htmlFor="pdf-upload"
                                style={{
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                }}
                            >
                                <img
                                    src={fileUpload}
                                    alt="Upload icon"
                                    style={{
                                        height: '60px',
                                        width: '60px',
                                        padding: '10px',
                                    }}
                                />
                                <span style={{ marginTop: '0.5rem', color: '#555' }}>
                                    Click or drag & drop to upload
                                </span>
                                <input
                                    id="pdf-upload"
                                    type="file"
                                    accept=".pdf"
                                    onChange={handleFileSelection}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        opacity: 0,
                                        cursor: 'pointer',
                                    }}
                                />
                            </label>
                        </div>
                    </div>
                    <div>
                        <button
                            onClick={handleUploadOnly}
                            style={{
                                padding: '1.0rem 1.5rem',
                                fontSize: '1rem',
                                backgroundColor: '#007acc',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                            }}
                        >
                            Upload PDF
                        </button>
                    </div>
                    <div>
                        <button
                            onClick={handleAddGeojson}
                            style={{
                                padding: '1.0rem 1.5rem',
                                fontSize: '1rem',
                                backgroundColor: '#007acc',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                marginRight: '1rem'
                            }}
                        >
                            Get Annotations
                        </button>
                        <button
                            onClick={handleSaveAnnotationsToDb}
                            disabled={!result?.pdf_id || loading}
                            style={{
                                padding: '1.0rem 1.5rem',
                                fontSize: '1rem',
                                backgroundColor: '#28a745',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: result?.pdf_id && !loading ? 'pointer' : 'not-allowed',
                                opacity: result?.pdf_id && !loading ? 1 : 0.7
                            }}
                        >
                            {'Save Annotations to Database'}
                        </button>
                    </div>
                </div>


                <Toolbar
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onResetZoom={handleResetZoom}
                    loading={loading}
                    onProcessPDF={processPDF}
                    onDownloadAnnotations={downloadAnnotations}
                    pdfSelected={!!pdfFile}
                    dbReady={dbReady}
                />

                <StatusBar message={statusMessage} />


                <AnnotationEditor
                    isVisible={!!selectedAnnotation}
                    editText={editText}
                    onTextChange={setEditText}
                    onUpdate={handleUpdateAnnotation}
                    onDelete={handleDeleteAnnotation}
                />

                <div style={{
                    display: 'flex',
                    gap: '1.5rem',
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    overflow: 'hidden'
                }}>
                    {/* 25% panel: Class buttons */}
                    <div style={{
                        flex: '0 0 25%',
                        padding: '1.5rem',
                        borderRight: '1px solid rgb(250, 250, 250)',
                        backgroundColor: '#f8fafc'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '1rem'
                        }}>
                            <h4 style={{
                                fontSize: '1.125rem',
                                fontWeight: '600',
                                color: '#1e293b',
                                margin: 0
                            }}>
                                Classes with Count
                            </h4>
                            <button
                                onClick={downloadClassInfo}
                                style={{
                                    padding: '0.5rem 1rem',
                                    backgroundColor: '#2563eb',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Download Excel
                            </button>
                        </div>

                        {/* Select All Checkbox */}
                        <div style={{
                            marginBottom: '1rem',
                            padding: '0.5rem',
                            backgroundColor: '#f1f5f9',
                            borderRadius: '6px'
                        }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer',
                                userSelect: 'none'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={classIds.length > 0 && classIds.every(id => visibleClasses.has(id))}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setVisibleClasses(new Set(classIds));
                                        } else {
                                            setVisibleClasses(new Set());
                                        }
                                    }}
                                    style={{
                                        width: '16px',
                                        height: '16px',
                                        cursor: 'pointer'
                                    }}
                                />
                                <span style={{ fontWeight: '500' }}>Select All Classes</span>
                            </label>
                        </div>

                        <div style={{
                            maxHeight: '480px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                            paddingRight: '4px'
                        }}>
                            {classIds
                                .sort((a, b) => a - b)
                                .map((id) => (
                                    <div
                                        key={id}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            borderRadius: '8px',
                                            border: 'none',
                                            transition: 'all 0.2s ease',
                                            backgroundColor: visibleClasses.has(id) ? '#dcfce7' : '#fee2e2',
                                            color: visibleClasses.has(id) ? '#166534' : '#991b1b',
                                            fontWeight: '500',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            cursor: 'pointer',
                                            flex: 1,
                                            userSelect: 'none'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={visibleClasses.has(id)}
                                                onChange={() => toggleClass(id)}
                                                style={{
                                                    width: '16px',
                                                    height: '16px',
                                                    cursor: 'pointer'
                                                }}
                                            />
                                            <span>
                                                {classDisplayNames[id] || `Class ${id}`}
                                                <span> = </span>
                                                ({getClassCount(id)})
                                            </span>
                                        </label>
                                    </div>
                                ))}
                        </div>
                    </div>


                    {/* 75% panel: PDF + annotations */}
                    <div style={{
                        flex: '1',
                        position: 'relative',
                        overflow: 'hidden',
                        backgroundColor: '#ffffff'
                    }}>
                        <div
                            className="canvas-container"
                            ref={scrollContainerRef}
                            onWheel={handleWheel}
                            style={{
                                height: 'calc(100vh - 400px)',
                                minHeight: '600px',
                                position: 'relative'
                            }}
                        >
                            {!pdfRendered && pdfDoc && (
                                <div style={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                    zIndex: 10,
                                    fontSize: '1.125rem',
                                    color: '#64748b'
                                }}>
                                    Rendering PDF…
                                </div>
                            )}

                            <div
                                className={`canvas-wrapper ${isDragging ? 'dragging' : ''}`}
                                ref={containerRef}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                                style={{
                                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                                    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                                    boxShadow: pdfRendered ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                                    position: 'relative'
                                }}
                            >
                                <canvas
                                    ref={canvasRef}
                                    className="pdf-canvas"
                                    style={{
                                        display: 'block',
                                        width: `${pdfInfoRef.current.baseCanvasWidth}px`,
                                        height: `${pdfInfoRef.current.baseCanvasHeight}px`
                                    }}
                                />

                                {pdfRendered && (
                                    <svg
                                        ref={svgOverlayRef}
                                        className="annotation-overlay"
                                        width={pdfInfoRef.current.baseCanvasWidth}
                                        height={pdfInfoRef.current.baseCanvasHeight}
                                        viewBox={`0 0 ${pdfInfoRef.current.baseCanvasWidth} ${pdfInfoRef.current.baseCanvasHeight}`}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0
                                        }}
                                    >
                                        {annotations.map((annotation) => {
                                            if (!visibleClasses.has(annotation.class_id)) return null;
                                            const screenCoords = convertToScreenCoords(annotation.coordinates);
                                            const pathData = `M ${screenCoords
                                                .map(([x, y]) => `${x},${y}`)
                                                .join(' L ')} Z`;

                                            return (
                                                <g key={annotation.id}>
                                                    {selectedAnnotation?.id === annotation.id && (
                                                        <path
                                                            d={pathData}
                                                            className="annotation-selection"
                                                            fill="rgba(37, 99, 235, 0.2)"
                                                            stroke="#2563eb"
                                                            strokeWidth="2"
                                                        />
                                                    )}
                                                    <path
                                                        d={pathData}
                                                        className="annotation-polygon"
                                                        fill="rgba(37, 99, 235, 0.1)"
                                                        stroke="#2563eb"
                                                        strokeWidth="1"
                                                        onClick={(e) => handleAnnotationClick(annotation, e)}
                                                        style={{
                                                            cursor: 'pointer'
                                                        }}
                                                    />
                                                    <rect
                                                        x={screenCoords[0]?.[0] || 0}
                                                        y={(screenCoords[0]?.[1] || 0) - 9}
                                                        width={Math.max(annotation.label.length * 2, 10)}
                                                        height="6"
                                                        fill="rgba(255, 255, 255, 0.9)"
                                                        onClick={(e) => handleAnnotationClick(annotation, e)}
                                                    />
                                                    <text
                                                        x={(screenCoords[0]?.[0] || 0) + 1}
                                                        y={(screenCoords[0]?.[1] || 0) - 6}
                                                        className="annotation-label-text"
                                                        fill="#1e293b"
                                                        fontSize="4"
                                                        onClick={(e) => handleAnnotationClick(annotation, e)}
                                                    >
                                                        {annotation.label}
                                                    </text>
                                                </g>
                                            );
                                        })}
                                    </svg>
                                )}
                            </div>

                            {pdfRendered && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: '1rem',
                                    right: '1rem',
                                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                                    color: '#ffffff',
                                    padding: '0.5rem 1rem',
                                    borderRadius: '6px',
                                    fontSize: '0.875rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    <span>Zoom: {Math.round(zoomLevel * 100)}%</span>
                                    <span>|</span>
                                    <span>{isRendering ? 'Enhancing…' : 'Scroll to zoom | Drag to pan'}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Excel Format Requirements */}
                {/* <div style={{
                    marginTop: '2rem',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                    maxWidth: 800,
                    background: '#ffffff',
                    borderRadius: 12,
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        backgroundColor: '#f8fafc',
                        padding: '1rem 1.5rem',
                        borderBottom: '1px solid #e2e8f0'
                    }}>
                        <h3 style={{
                            fontSize: '1.25rem',
                            fontWeight: '600',
                            color: '#1e293b',
                            margin: 0
                        }}>
                            Required Excel Format
                        </h3>
                    </div>
                    <div style={{ padding: '1.5rem' }}>
                        <div style={{
                            backgroundColor: '#fef2f2',
                            border: '1px solid #fee2e2',
                            borderRadius: '6px',
                            padding: '1rem',
                            marginBottom: '1rem'
                        }}>
                            <p style={{ color: '#991b1b', margin: 0 }}>
                                ⚠️ Your Excel file must have these exact column names: <strong>component_name</strong>, <strong>class_id</strong>, and <strong>count</strong>
                            </p>
                        </div>
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '0.95rem'
                        }}>
                            <thead>
                                <tr style={{
                                    backgroundColor: '#f1f5f9'
                                }}>
                                    <th style={{
                                        padding: '0.75rem 1rem',
                                        textAlign: 'left',
                                        borderBottom: '2px solid #e2e8f0',
                                        color: '#475569'
                                    }}>Column Name</th>
                                    <th style={{
                                        padding: '0.75rem 1rem',
                                        textAlign: 'left',
                                        borderBottom: '2px solid #e2e8f0',
                                        color: '#475569'
                                    }}>Description</th>
                                    <th style={{
                                        padding: '0.75rem 1rem',
                                        textAlign: 'left',
                                        borderBottom: '2px solid #e2e8f0',
                                        color: '#475569'
                                    }}>Example</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{
                                        padding: '0.75rem 1rem',
                                        borderBottom: '1px solid #e2e8f0',
                                        color: '#374151'
                                    }}>component_name</td>
                                    <td style={{
                                        padding: '0.75rem 1rem',
                                        borderBottom: '1px solid #e2e8f0',
                                        color: '#374151'
                                    }}>Name of the component</td>
                                    <td style={{
                                        padding: '0.75rem 1rem',
                                        borderBottom: '1px solid #e2e8f0',
                                        color: '#374151'
                                    }}>Field-Mounted Instrument</td>
                                </tr>
                                <tr>
                                    <td style={{
                                        padding: '0.75rem 1rem',
                                        borderBottom: '1px solid #e2e8f0',
                                        color: '#374151'
                                    }}>class_id</td>
                                    <td style={{
                                        padding: '0.75rem 1rem',
                                        borderBottom: '1px solid #e2e8f0',
                                        color: '#374151'
                                    }}>Class ID number</td>
                                    <td style={{
                                        padding: '0.75rem 1rem',
                                        borderBottom: '1px solid #e2e8f0',
                                        color: '#374151'
                                    }}>0</td>
                                </tr>
                                <tr>
                                    <td style={{
                                        padding: '0.75rem 1rem',
                                        borderBottom: '1px solid #e2e8f0',
                                        color: '#374151'
                                    }}>count</td>
                                    <td style={{
                                        padding: '0.75rem 1rem',
                                        borderBottom: '1px solid #e2e8f0',
                                        color: '#374151'
                                    }}>Number of components</td>
                                    <td style={{
                                        padding: '0.75rem 1rem',
                                        borderBottom: '1px solid #e2e8f0',
                                        color: '#374151'
                                    }}>5</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div> */}
                <div style={{
                            backgroundColor: '#f8fafc',
                            padding: '1.5rem',
                            borderBottom: '1px solid '
                        }}>
                            <h3 style={{
                                fontSize: '1.5rem',
                                fontWeight: '600',
                                color: '#1e293b',
                                margin: 0,
                                textAlign: 'center'
                            }}>
                                Comparison Results
                            </h3>
                        </div>

                {/* Upload Bill/Excel and Compare PDF controls */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center ',
                    maxWidth: 800,
                    margin: '2rem auto 0 auto',
                    gap: '1rem',
                    height: '50px',
                }}>
                    <input
                        type="file"
                        accept=".xlsx"
                        ref={fileInputRef}
                        style={{ display: "none" }}
                        onChange={handleCompareFileChange}
                    />
                    <button
                        onClick={() => fileInputRef.current && fileInputRef.current.click()}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#2563eb',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                    >
                        Upload Bill/Excel
                    </button>
                    <button
                        onClick={handleCompareClick}
                        style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#f59e42',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                        disabled={!uploadedExcelFile}
                    >
                        Compare PDF
                    </button>
                </div>

                {compareResults && (
                    <div style={{
                        marginTop: '2rem',
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        maxWidth: 1000,
                        background: '#ffffff',
                        borderRadius: 12,
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        overflow: 'hidden'
                    }}>
                        {/* Header */}
                        

                        {/* Table Container */}
                        <div style={{
                            maxHeight: '400px',
                            overflowY: 'auto',
                            overflowX: 'auto'
                        }}>
                            <table style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '0.95rem'
                            }}>
                                <thead style={{
                                    position: 'sticky',
                                    top: 0,
                                    backgroundColor: '#f1f5f9',
                                    zIndex: 1
                                }}>
                                    <tr>
                                        <th style={{
                                            padding: '1rem 1.5rem',
                                            textAlign: 'left',
                                            fontWeight: '600',
                                            color: '#475569',
                                            borderBottom: '2px solid #e2e8f0',
                                            backgroundColor: '#f1f5f9'
                                        }}>
                                            ID
                                        </th>
                                        <th style={{
                                            padding: '1rem 1.5rem',
                                            textAlign: 'left',
                                            fontWeight: '600',
                                            color: '#475569',
                                            borderBottom: '2px solid #e2e8f0',
                                            backgroundColor: '#f1f5f9'
                                        }}>
                                            Pdf Id
                                        </th>
                                        <th style={{
                                            padding: '1rem 1.5rem',
                                            textAlign: 'left',
                                            fontWeight: '600',
                                            color: '#475569',
                                            borderBottom: '2px solid #e2e8f0',
                                            backgroundColor: '#f1f5f9'
                                        }}>
                                            Class Id
                                        </th>
                                        <th style={{
                                            padding: '1rem 1.5rem',
                                            textAlign: 'left',
                                            fontWeight: '600',
                                            color: '#475569',
                                            borderBottom: '2px solid #e2e8f0',
                                            backgroundColor: '#f1f5f9'
                                        }}>
                                            Class Name
                                        </th>
                                        <th style={{
                                            padding: '1rem 1.5rem',
                                            textAlign: 'center',
                                            fontWeight: '600',
                                            color: '#475569',
                                            borderBottom: '2px solid #e2e8f0',
                                            backgroundColor: '#f1f5f9'
                                        }}>
                                            Count
                                        </th>
                                        <th style={{
                                            padding: '1rem 1.5rem',
                                            textAlign: 'center',
                                            fontWeight: '600',
                                            color: '#475569',
                                            borderBottom: '2px solid #e2e8f0',
                                            backgroundColor: '#f1f5f9'
                                        }}>
                                            Mismatch Count
                                        </th>
                                        <th style={{
                                            padding: '1rem 1.5rem',
                                            textAlign: 'center',
                                            fontWeight: '600',
                                            color: '#475569',
                                            borderBottom: '2px solid #e2e8f0',
                                            backgroundColor: '#f1f5f9'
                                        }}>
                                            Status
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {compareResults.map((row, idx) => (
                                        <tr key={idx} style={{
                                            backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                            transition: 'background-color 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#f8fafc'}
                                        >
                                            <td style={{
                                                padding: '1rem 1.5rem',
                                                color: '#374151',
                                                borderBottom: '1px solid #f1f5f9'
                                            }}>
                                                {idx + 1}
                                            </td>
                                            <td style={{
                                                padding: '1rem 1.5rem',
                                                color: '#374151',
                                                borderBottom: '1px solid #f1f5f9'
                                            }}>
                                                {row.pdf_id || '1'}
                                            </td>
                                            <td style={{
                                                padding: '1rem 1.5rem',
                                                color: '#374151',
                                                borderBottom: '1px solid #f1f5f9'
                                            }}>
                                                {row.class_id}
                                            </td>
                                            <td style={{
                                                padding: '1rem 1.5rem',
                                                color: '#374151',
                                                borderBottom: '1px solid #f1f5f9'
                                            }}>
                                                {row.component_name || 'Demo'}
                                            </td>
                                            <td style={{
                                                padding: '1rem 1.5rem',
                                                textAlign: 'center',
                                                color: '#374151',
                                                borderBottom: '1px solid #f1f5f9'
                                            }}>
                                                {row.count_db ?? row.count_file ?? "N/A"}
                                            </td>
                                            <td style={{
                                                padding: '1rem 1.5rem',
                                                textAlign: 'center',
                                                color: '#374151',
                                                borderBottom: '1px solid #f1f5f9'
                                            }}>
                                                {row.difference !== null ? (
                                                    <span style={{
                                                        color: row.difference > 0 ? '#166534' : row.difference < 0 ? '#991b1b' : '#374151',
                                                        fontWeight: '500'
                                                    }}>
                                                        {row.difference > 0 ? '+' : ''}{row.difference}
                                                    </span>
                                                ) : 'N/A'}
                                            </td>
                                            <td style={{
                                                padding: '1rem 1.5rem',
                                                textAlign: 'center',
                                                borderBottom: '1px solid #f1f5f9'
                                            }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    padding: '0.375rem 0.75rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.875rem',
                                                    fontWeight: '500',
                                                    backgroundColor: row.match ? '#dcfce7' : '#fee2e2',
                                                    color: row.match ? '#166534' : '#991b1b',
                                                    border: `1px solid ${row.match ? '#bbf7d0' : '#fecaca'}`
                                                }}>
                                                    {row.match && (
                                                        <span style={{ color: '#166534' }}>✓</span>
                                                    )}
                                                    {row.match ? 'Matched' : 'Mismatch'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer with summary */}
                        <div style={{
                            backgroundColor: '#f8fafc',
                            padding: '1rem 1.5rem',
                            borderTop: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.875rem',
                            color: '#64748b'
                        }}>
                            <span>Total Records: {compareResults.length}</span>
                            <span>
                                Matched: {compareResults.filter(row => row.match).length} | 
                                Mismatched: {compareResults.filter(row => !row.match).length}
                            </span>
                        </div>
                    </div>
                )}


            </main>

            <Footer />
        </div>
    );
};

export default LandingPage;
