import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.entry';
import StatusBar from './StatusBar';
import Toolbar from './Toolbar';
import AnnotationEditor from './AnnotationEditor';

import { uploadPDF, getGeoJSON, updateAnnotation, deleteAnnotation, healthCheck, getClassMappings } from '../services/api';
import '../styles/PDFAnnotator.css';

// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Configuration constants
const DEFAULT_GEOJSON_FILE = 'annotations_page_1.geojson';
const TARGET_WIDTH = 9934;
const TARGET_HEIGHT = 7017;

export default function PDFAnnotator() {
  // State
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
  
  
  
  // Refs
  const canvasRef = useRef(null);
  const svgOverlayRef = useRef(null);
  const containerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const renderTimeoutRef = useRef(null);
  
  
  
  // Store PDF rendering info
  const pdfInfoRef = useRef({
    page: null,
    baseScale: 1,
    originalWidth: 0,
    originalHeight: 0,
    baseCanvasWidth: 0,
    baseCanvasHeight: 0
  });


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
        setClassMappings({1: "1", 2: "2", 3: "3"});
      } else {
        setClassMappings(response.data.mappings);
        console.log('✅ Loaded class mappings from backend');
      }
    } catch (error) {
      console.error('Error loading class mappings:', error);
      setClassMappings({1: "1", 2: "2", 3: "3"}); // minimal fallback
    } finally {
      setMappingsLoaded(true);
    }
  };

  //   const CLASS_ID_TO_NAME = {
  //   1: "1",
  //   2: "2",
  //   3: "3",
  //   4: "4",
  //   5: "5",
  //   6: "6",
  //   7: "7",
  //   8: "8",
  //   9: "9",
  //   10: "10",
  //   11: "11",
  //   12: "12",
  //   13: "13",
  //   14: "14",
  //   15: "15",
  //   16: "16",
  //   17: "17",
  //   18: "18",
  //   19: "19",
  //   20: "20" 
  // };
  

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


// 1. Remove any refresh/reload functionality from processPDF
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

// const handleAddGeojson = async () => {
//   setStatusMessage('Loading static GeoJSON…');
//   try {
//     const res = await fetch('/annotations_page_1.geojson');
//     if (!res.ok) throw new Error(`HTTP ${res.status}`);
//     const geojson = await res.json();

//     // processAnnotations is your existing helper
//     const processedAnnotations = processAnnotations(geojson);

//     // update state so your SVG overlay will render it
//     setResult(prev => ({
//       ...prev,
//       pages: [{ ...prev?.pages?.[0], geojson }]
//     }));
//     setAnnotations(processedAnnotations);
//     console.log('Static GeoJSON loaded:', geojson);
//     setStatusMessage('GeoJSON added successfully');
//   } catch (err) {
//     console.error('Error loading static GeoJSON:', err);
//     setStatusMessage('Error: Could not load GeoJSON');
//   }
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
  
  const downloadAnnotations = () => {
    const link = document.createElement('a');
    link.href = 'http://localhost:8000/api/download-annotations';
    link.download = 'annotations_export.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // High-quality PDF rendering function
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

  // Smooth zoom function
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

const refreshAnnotationsFromDatabase = async () => {
  if (!result?.pdf_id) {
    setStatusMessage('No PDF loaded');
    return;
  }

  setStatusMessage('Refreshing annotations...');
  try {
    // Use the existing getGeoJSON endpoint with pdf_id
    const response = await getGeoJSON("annotations_page_1.geojson", result.pdf_id);
    
    if (response.error) {
      throw new Error(response.error.message || 'Failed to load annotations');
    }
    
    const geojson = response.data;
    const processedAnnotations = processAnnotations(geojson);

    // Update the result state with fresh data
    setResult(prev => ({
      ...prev,
      pages: [{ 
        ...prev?.pages?.[0], 
        geojson 
      }]
    }));
    
    setAnnotations(processedAnnotations);
    setStatusMessage(`Loaded ${processedAnnotations.length} annotations from database`);
    
  } catch (error) {
    console.error('Failed to refresh annotations:', error);
    setStatusMessage(`Error refreshing annotations: ${error.message}`);
  }
};

const handleUpdateAnnotation = async () => {
  if (!selectedAnnotation) return;

  // 1) Prepare the payload
  const matchClassId     = selectedAnnotation.class_id;
  const matchConfidence  = parseFloat(selectedAnnotation.confidence.toFixed(4));
  const classIdMatch     = editText.match(/^(\d+)/);
  const newClassId       = classIdMatch ? parseInt(classIdMatch[1], 10) : matchClassId;
  
  const updatePayload    = {
    match_class_id:    matchClassId,
    match_confidence:  matchConfidence,
    new_class_id:      newClassId,
    renamed_name:      editText,
  };

  // 2) Optimistically update in‐memory state
  setAnnotations(prev =>
    prev.map(ann =>
      ann.id === selectedAnnotation.id
        ? { ...ann, label: editText, renamed_name: editText, class_id: newClassId }
        : ann
    )
  );
  setHasUnsavedChanges(true);

  // 3) Call your API to persist
  try {
    const filename = 'annotations_page_1.geojson';
    const pdfId    = result?.pdf_id || null;                 // pass null will use filename
    const res      = await updateAnnotation(filename, updatePayload, pdfId);

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



// 3. Modified delete handler - only updates frontend, tracks deletion
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




// 4. Function to sync all changes to database
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

  // 6. Enhanced processAnnotations to handle renamed names
const processAnnotations = (geojson) => {
  if (!geojson?.features) return [];
  
  return geojson.features.map((feature, index) => {
    const { geometry, properties } = feature;
    
    if (!geometry?.coordinates?.[0]) return null;
    
    const classId = properties.class_id;
    // const className = CLASS_ID_TO_NAME[classId] || `Class ${classId}`;
    const className = classMappings[classId] || `Class ${classId}`;
    const confidenceValue = parseFloat(properties.confidence);
    const confidenceDisplay = isNaN(confidenceValue) ? "N/A" : confidenceValue.toFixed(4);
    
    // Use renamed_name if available, otherwise use class name
    const displayName = properties.renamed_name || className;
    const labelText = `${displayName} (${confidenceDisplay})`;
    
    return {
      id: properties.annotation_id || `annotation-${index}`,
      coordinates: geometry.coordinates[0],
      class_id: classId,
      class_name: className,
      confidence: confidenceValue,
      label: labelText,
      renamed_name: properties.renamed_name,
      properties
    };
  }).filter(Boolean);
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
  
  // Effect to render PDF immediately when loaded
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

  return (
    <div className="pdf-annotator">
      <div className="header">
        <h1>PDF Analyzer 1</h1>
      </div>
      
      <div className="file-inputs">
        <div className="file-input-container">
          <label className="styled-upload"></label>
          <label htmlFor="pdf-upload">Upload PDF:</label>
          <input
            id="pdf-upload"
            type="file"
            accept=".pdf"
            onChange={handleFileSelection}
          />
        </div>
        

        <div className="file-input-container">
          <button onClick={handleAddGeojson}>Add GeoJSON</button>
        </div>

      </div>

      <div className="mb-4 flex flex-wrap gap-2 justify-center">
        {classIds.sort((a,b) => a - b).map(id => (
          <button
            key={id}
            onClick={() => toggleClass(id)}
            className={`px-3 py-1 rounded text-white ${
              visibleClasses.has(id) ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {visibleClasses.has(id) ? 'Hide' : 'Show'} Class {id}
          </button>
        ))}
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
      
      <div 
        className="canvas-container" 
        ref={scrollContainerRef}
        onWheel={handleWheel}
      >
        {!pdfRendered && pdfDoc && (
          <div className="loading-overlay">
            Rendering PDF...
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
            boxShadow: pdfRendered ? '0 4px 12px rgba(0,0,0,0.15)' : 'none'
          }}
        >
          <canvas 
            ref={canvasRef}
            className="pdf-canvas"
          />
          
          {/* SVG overlay for annotations */}
          
          {pdfRendered && (
            <svg
              ref={svgOverlayRef}
              className="annotation-overlay"
              width={pdfInfoRef.current.baseCanvasWidth}
              height={pdfInfoRef.current.baseCanvasHeight}
              viewBox={`0 0 ${pdfInfoRef.current.baseCanvasWidth} ${pdfInfoRef.current.baseCanvasHeight}`}
            >
              {annotations.map((annotation) => {
                if (!visibleClasses.has(annotation.class_id)) return null;
                const screenCoords = convertToScreenCoords(annotation.coordinates);
                const pathData = `M ${screenCoords.map(([x, y]) => `${x},${y}`).join(' L ')} Z`;
                
                return (
                  <g key={annotation.id}>
                    {/* Selection highlight */}
                    {selectedAnnotation?.id === annotation.id && (
                      <path
                        d={pathData}
                        className="annotation-selection"
                        
                      />
                    )}
                    
                    {/* Main polygon */}
                    <path
                      d={pathData}
                      className="annotation-polygon"
                      onClick={(e) => handleAnnotationClick(annotation, e)}
                    />
                    
                    {/* Label background */}
                    <rect
                      x={screenCoords[0]?.[0] || 0}
                      y={(screenCoords[0]?.[1] || 0) - 9}
                      width={Math.max(annotation.label.length * 2, 10)}
                      height="6"
                      className="annotation-label-bg"
                      onClick={(e) => handleAnnotationClick(annotation, e)}
                    />

                    {/* Label text - smaller font */}
                    <text
                      x={(screenCoords[0]?.[0] || 0) + 1}
                      y={(screenCoords[0]?.[1] || 0) - 6}
                      className="annotation-label-text"
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
      </div>
      
      {pdfRendered && (
        <div className="zoom-info">
          Zoom: {Math.round(zoomLevel * 100)}% | {isRendering ? 'Enhancing...' : 'Scroll to zoom | Drag to pan'}
        </div>
      )}
    </div>
  );
}
