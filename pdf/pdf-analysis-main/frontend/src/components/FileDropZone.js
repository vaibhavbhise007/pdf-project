
import fileUpload from '../assets/fileUpload.png'
import React, { useState, useEffect, useRef, useCallback } from 'react';


export default function FileDropZone  ()  {

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

    
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '1rem'

            }}
        >
            <div
                className="flex w-full max-w-lg mx-auto"
                style={{
                    width: '100%',
                    maxWidth: '600px', // max width for larger screens
                    height: '250px',
                    border: '2px dashed #aaa',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1rem',
                    boxSizing: 'border-box',
                    backgroundColor: '#f9f9f9',

                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <label htmlFor="dropzone-file" >
                    <div className="flex flex-col items-center justify-center pb-6 pt-5">
                        <img
                            src={fileUpload}
                            style={{
                                height: '60px',
                                width: '60px',
                                padding: '10px'
                            }}
                        />

                    </div>
                    <input
                        type="file"
                        id="dropzone-file"
                        style={{ paddingLeft: '50px' }}
                        accept=".pdf"
                        onChange={handleFileSelection} />
                </label>
            </div>
        </div>
    );
};

