import React from 'react';
// import PDFAnnotator from './components/PDFAnnotator';
// import './styles/App.css';

// function App() {
//   return (
//     <div className="app">
//       <PDFAnnotator />
//     </div>
//   );
// }
// export default App;


import LandingPage from './components/LandingPage';
const App = () => React.createElement(LandingPage, null);
export default App;
























//******************************** Frontend connect with backend ******************************************* */
/*
import React, { useRef, useState, useEffect } from 'react';
import { fabric } from 'fabric';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function PDFAnalyzer() {
  const [file, setFile] = useState(null);
  const [pdfURL, setPdfURL] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null);
  const canvasRefs = useRef({});

  useEffect(() => {
    if (!pdfURL) return;
    const loadPDF = async () => {
      const loadingTask = pdfjsLib.getDocument(pdfURL);
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
    };
    loadPDF();
  }, [pdfURL]);

  useEffect(() => {
    if (!pdfDoc || !result?.pages) return;

    result.pages.forEach(async (page) => {
      const canvasEl = canvasRefs.current[page.page];
      if (!canvasEl) return;

      const pg = await pdfDoc.getPage(page.page);
      const scale = 2.0;
      const viewport = pg.getViewport({ scale });

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = viewport.width;
      tempCanvas.height = viewport.height;
      const tempCtx = tempCanvas.getContext('2d');

      await pg.render({ canvasContext: tempCtx, viewport }).promise;

      canvasEl.width = viewport.width;
      canvasEl.height = viewport.height;

      const fabricCanvas = new fabric.Canvas(canvasEl, { selection: false });
      const dataUrl = tempCanvas.toDataURL();

      fabric.Image.fromURL(dataUrl, (img) => {
        fabricCanvas.setBackgroundImage(img, fabricCanvas.renderAll.bind(fabricCanvas), {
          scaleX: 1,
          scaleY: 1,
        });

        // Fetch GeoJSON and overlay predictions
        fetch(page.geojson_url)
          .then((res) => res.json())
          .then((geojson) => {
            geojson.features.forEach((feature) => {
              const points = feature.geometry.coordinates[0].map(([x, y]) => ({ x, y }));

              const polygon = new fabric.Polygon(points, {
                stroke: 'red',
                strokeWidth: 2,
                fill: 'rgba(255, 0, 0, 0.3)',
                selectable: false,
              });
              fabricCanvas.add(polygon);

              const { class_id, confidence } = feature.properties;
              const label = new fabric.Text(`${class_id} (${confidence.toFixed(2)})`, {
                left: points[0].x,
                top: points[0].y - 20,
                fontSize: 16,
                fill: 'white',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                padding: 4,
                shadow: '2px 2px 5px rgba(0, 0, 0, 0.5)',
                selectable: false,
              });
              fabricCanvas.add(label);
            });
          });
      });
    });
  }, [pdfDoc, result]);

  const handleChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setPdfURL(URL.createObjectURL(selectedFile));
    setResult(null);
  };

  const handleSubmit = async () => {
    if (!file) {
      alert('Please upload a PDF file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    setLoading(true);

    try {
      const res = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      setResult({ message: data.message, pages: data.pages });
    } catch (error) {
      console.error('Upload error:', error);
      setResult({ message: 'Failed to process PDF' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 px-4 text-center">
      <h1 className="text-3xl font-bold text-blue-600 mb-6">Welcome to PDF Analyzer</h1>

      <input type="file" accept=".pdf" onChange={handleChange} className="mb-4" />

      <button
        onClick={handleSubmit}
        className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded font-semibold"
        disabled={loading}
      >
        {loading ? 'Processing...' : 'Get Result'}
      </button>

      <div className="mt-6 w-full flex flex-col items-center">
        {pdfDoc &&
          result?.pages?.map((page) => (
            <canvas
              key={page.page}
              ref={(el) => {
                if (el) canvasRefs.current[page.page] = el;
              }}
              className="border border-gray-300 shadow-md mb-6"
            />
          ))}
      </div>
    </div>
  );
}
*/












//****************************FINAL******************************/

// import React, { useRef, useState, useEffect } from 'react';
// import { fabric } from 'fabric';
// // import * as fabric from 'fabric';

// import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
// import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.entry';

// pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;


// // Function to track the current annotations and handle deletions
// const extractAnnotations = (fabricCanvas, previousAnnotations = []) => {
//   if (!fabricCanvas || typeof fabricCanvas.getObjects !== 'function') return {
//     currentAnnotations: [],
//     deletedAnnotations: [],
//   };

//   const currentAnnotations = fabricCanvas.getObjects().map((obj) => {
//     if (obj.type === 'group') {
//       const polygon = obj.item(0); // polygon
//       const label = obj.item(1);   // label

//       return {
//         type: 'Feature',
//         geometry: {
//           type: 'Polygon',
//           coordinates: [polygon.points.map(p => [p.x, p.y])],
//         },
//         properties: {
//           class_id: polygon.class_id || '',
//           confidence: polygon.confidence || 0,
//           label: label.text || '',
//         },
//       };
//     }
//     return null;
//   }).filter(Boolean);

//   const deletedAnnotations = previousAnnotations.filter(prev =>
//     !currentAnnotations.some(curr => curr.properties.class_id === prev.properties.class_id)
//   );

//   return {
//     currentAnnotations,
//     deletedAnnotations,
//   };
// };


// // Send updated annotations to the backend
// const sendAnnotationsToBackend = ({ modified = [], deleted = [] }) => {
//   const updates = [...modified, ...deleted];

//   fetch('http://localhost:8000/api/updateGeojson?filename=annotations_page_1.geojson', {
//     method: 'PUT',
//     headers: {
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({ updates }),
//   })
//     .then(res => res.json())
//     .then(data => console.log('✅ GeoJSON updated:', data))
//     .catch(err => console.error('❌ Update failed:', err));

// };


// function sendDeleteToBackend(payload) {
//   fetch('http://localhost:8000/api/deleteGeojson', {
//     method: 'PUT',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify(payload),
//   })
//     .then(res => res.json())
//     .then(data => {
//       console.log('✅ Delete response:', data);
//     })
//     .catch(err => {
//       console.error('❌ Delete error:', err);
//     });
// }


// export default function PDFAnalyzer() {
//   const [pdfURL, setPdfURL] = useState(null);
//   const [result, setResult] = useState(null);
//   const [pdfDoc, setPdfDoc] = useState(null);
//   const canvasRef = useRef(null);
//   const fabricCanvasRef = useRef(null);
//   const scrollContainerRef = useRef(null);
//   const [selectedGroup, setSelectedGroup] = useState(null);
//   const [editText, setEditText] = useState('');

//   const [previousAnnotations, setPreviousAnnotations] = useState([]);
//   const TARGET_WIDTH = 9934;
//   const TARGET_HEIGHT = 7017;
//   const MAX_CANVAS_WIDTH = 2000;

//   const [canvasWidth, setViewportWidth] = useState(MAX_CANVAS_WIDTH);
//   const [canvasHeight, setViewportHeight] = useState(window.innerHeight * 0.8);

//   const [zoomLevel, setZoomLevel] = useState(1);

//   const handleZoomIn = () => {
//     const fabricCanvas = fabricCanvasRef.current;
//     if (!fabricCanvas) return;

//     const canvasWidth = fabricCanvas.getWidth();
//     const zoomPoint = new fabric.Point(canvasWidth / 2, 0); // Top-center

//     let newZoom = Math.min(zoomLevel * 1.2, 5);
//     fabricCanvas.zoomToPoint(zoomPoint, newZoom);
//     setZoomLevel(newZoom);
//   };

//   const handleZoomOut = () => {
//     const fabricCanvas = fabricCanvasRef.current;
//     if (!fabricCanvas) return;

//     const canvasWidth = fabricCanvas.getWidth();
//     const zoomPoint = new fabric.Point(canvasWidth / 2, 0); // Top-center

//     let newZoom = Math.max(zoomLevel / 1.2, 0.5);
//     fabricCanvas.zoomToPoint(zoomPoint, newZoom);
//     setZoomLevel(newZoom);
//   };

//   const handleResetZoom = () => {
//     const fabricCanvas = fabricCanvasRef.current;
//     if (!fabricCanvas) return;
//     setZoomLevel(1);
//     fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
//   };

//   const [file, setFile] = useState(null);
//   const [loading, setLoading] = useState(false);

//   const handleSubmit = async () => {
//     if (!file) {
//       alert('Please upload a PDF file.');
//       return;
//     }

//     const formData = new FormData();
//     formData.append('file', file);
//     setLoading(true);

//     try {
//       const res = await fetch('http://localhost:8000/upload', {
//         method: 'POST',
//         body: formData,
//       });

//       const data = await res.json();
//       setResult({ message: data.message, pages: data.pages });

//       // Auto-load GeoJSON from backend
//       const geojsonRes = await fetch(data.pages[0].geojson_url);
//       const geojson = await geojsonRes.json();
//       setResult({ message: data.message, pages: [{ page: 1, geojson }] });

//     } catch (error) {
//       console.error('Upload error:', error);
//       setResult({ message: 'Failed to process PDF' });
//     } finally {
//       setLoading(false);
//     }
//   };


//   useEffect(() => {
//     const handleResize = () => {
//       setViewportWidth(Math.min(window.innerWidth * 0.9, canvasWidth));
//       setViewportHeight(window.innerHeight * 0.8);
//     };

//     window.addEventListener("resize", handleResize);
//     return () => window.removeEventListener("resize", handleResize);
//   }, []);

//   useEffect(() => {
//     if (!pdfURL) return;
//     const loadPDF = async () => {
//       const loadingTask = pdfjsLib.getDocument(pdfURL);
//       const pdf = await loadingTask.promise;
//       setPdfDoc(pdf);
//     };
//     loadPDF();
//   }, [pdfURL]);

//   useEffect(() => {
//     if (!pdfDoc || !result?.pages?.length) return;

//     const renderPage = async () => {
//       const pageNum = result.pages[0].page;
//       const geojson = result.pages[0].geojson;
//       const canvasEl = canvasRef.current;

//       const page = await pdfDoc.getPage(pageNum);
//       const dpiScale = Math.min(4, MAX_CANVAS_WIDTH / page.view[2]);
//       const scale = dpiScale;
//       const viewport = page.getViewport({ scale });

//       const offCanvas = document.createElement('canvas');
//       offCanvas.width = viewport.width;
//       offCanvas.height = viewport.height;

//       const ctx = offCanvas.getContext('2d');
//       await page.render({ canvasContext: ctx, viewport }).promise;

//       const imgDataUrl = offCanvas.toDataURL();

//       canvasEl.width = viewport.width;
//       canvasEl.height = viewport.height;

//       const fabricCanvas = new fabric.Canvas(canvasEl, {
//         selection: true,
//         preserveObjectStacking: true,
//       });
//       fabricCanvasRef.current = fabricCanvas;

//       fabric.Image.fromURL(imgDataUrl, (img) => {
//         img.set({ selectable: false, evented: false });
//         fabricCanvas.setBackgroundImage(img, fabricCanvas.renderAll.bind(fabricCanvas));
//       });

//       const scaleX = viewport.width / TARGET_WIDTH;
//       const scaleY = viewport.height / TARGET_HEIGHT;

//       geojson.features.forEach(({ geometry, properties }) => {
//         const scaledPoints = geometry.coordinates[0].map(([x, y]) => ({
//           x: x * scaleX,
//           y: y * scaleY,
//         }));

//         const polygon = new fabric.Polygon(scaledPoints, {
//           stroke: 'red',
//           strokeWidth: 2,
//           fill: 'rgba(255, 0, 0, 0.3)',
//           selectable: true,
//           evented: true,
//           objectCaching: false,
//           hasControls: true,
//           hasBorders: true,
//         });

//         const labelText = `${properties.class_id} (${properties.confidence.toFixed(4)})`;
//         const label = new fabric.Text(labelText, {
//           left: scaledPoints[0].x,
//           top: scaledPoints[0].y - 20,
//           fontSize: 14,
//           fontWeight: 'bold',
//           fill: 'red',
//           backgroundColor: 'transparent',
//           padding: 6,
//           selectable: true,
//           evented: true,
//         });


//         const group = new fabric.Group([polygon, label], {
//           selectable: true,
//           evented: true,
//         });

//         polygon.class_id = properties.class_id;
//         polygon.confidence = properties.confidence;

//         fabricCanvas.add(group);
//       });

//       fabricCanvas.renderAll();

//       // Selection handlers
//       fabricCanvas.on('selection:created', (e) => {
//         const group = e.target;
//         if (group?.type === 'group') {
//           setSelectedGroup(group);
//           const labelObj = group.item(1);
//           setEditText(labelObj.text);
//         }
//       });

//       fabricCanvas.on('selection:cleared', () => {
//         setSelectedGroup(null);
//         setEditText('');
//       });



//     };
//     renderPage();
//   }, [pdfDoc, result]);


//   const handlePdfChange = (e) => {
//     const file = e.target.files[0];
//     if (file) setPdfURL(URL.createObjectURL(file));
//   };

//   const handleGeojsonChange = (e) => {
//     const file = e.target.files[0];
//     if (!file) return;

//     const reader = new FileReader();
//     reader.onload = () => {
//       try {
//         const geojson = JSON.parse(reader.result);
//         setResult({
//           message: 'Loaded from local file',
//           pages: [{ page: 1, geojson }],
//         });
//       } catch (err) {
//         console.error('Invalid GeoJSON:', err);
//         alert('Invalid GeoJSON file');
//       }
//     };
//     reader.readAsText(file);
//   };

//   return (
//     <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 px-4 text-center">
//       <div>
//         <h1 className="text-3xl font-bold text-blue-600 mb-6">Welcome to PDF Analyzer</h1>
//       </div>

//       <div className="mb-6 pt-8">
//         <input
//           type="file"
//           accept=".pdf"
//           onChange={(e) => {
//             setFile(e.target.files[0]);
//             setPdfURL(URL.createObjectURL(e.target.files[0]));
//           }}
//           className="mb-4" 
//         />

//         <input type="file" accept=".geojson,.json" onChange={handleGeojsonChange} className="mb-4" />
//       </div>

//       <div className="flex justify-center items-center space-x-4">
//         <button onClick={handleZoomIn} className="bg-blue-600 text-white px-3 py-1 rounded">Zoom In</button>
//         <button onClick={handleZoomOut} className="bg-blue-600 text-white px-3 py-1 rounded">Zoom Out</button>
//         <button onClick={handleResetZoom} className="bg-gray-600 text-white px-3 py-1 rounded">Reset</button>
//       </div>

//       {selectedGroup && (
//         <div
//           style={{
//             position: 'fixed',
//             top: '100px',
//             right: '50px',
//             backgroundColor: 'white',
//             border: '1px solid #ccc',
//             borderRadius: '8px',
//             padding: '12px',
//             zIndex: 100,
//             boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
//           }}
//         >
//           <div className="mb-2">
//             <input
//               type="text"
//               value={editText}
//               onChange={(e) => setEditText(e.target.value)}
//               className="border p-1 rounded w-full"
//             />
//           </div>
//           <div className="flex justify-between space-x-2">
//             <button
//               onClick={() => {
//                 const polygon = selectedGroup.item(0);
//                 const label = selectedGroup.item(1);

//                 // Optionally update label text visually
//                 label.set('text', editText);
//                 selectedGroup.canvas?.renderAll();

//                 // Extract only class_id (before space) and use as new_class_id
//                 const newClassId = parseInt(editText.split(' ')[0], 10);

//                 // Prepare payload (only match_class_id, match_confidence, new_class_id)
//                 const updatedPayload = {
//                   match_class_id: polygon.class_id,
//                   match_confidence: Number(polygon.confidence.toFixed(4)),  
//                   new_class_id: newClassId || polygon.class_id
//                 };

//                 sendAnnotationsToBackend({ modified: [updatedPayload] });
//                 setSelectedGroup(null);
//               }}
//               className="bg-green-600 text-white px-3 py-1 rounded"
//             >
//               Update
//             </button>


//             <button
//               onClick={() => {
//                 const fabricCanvas = fabricCanvasRef.current;
//                 if (!fabricCanvas || !selectedGroup) return;

//                 const polygon = selectedGroup.item(0);
//                 const targetClassId = polygon.class_id;
//                 const targetConfidence = Number(polygon.confidence.toFixed(4));  

//                 const objects = fabricCanvas.getObjects();

//                 for (let obj of objects) {
//                   if (obj.type === 'group') {
//                     const poly = obj.item(0);
//                     const classIdMatch = poly.class_id === targetClassId;
//                     const confidenceMatch = Number(poly.confidence.toFixed(4)) === targetConfidence;

//                     if (classIdMatch && confidenceMatch) {
//                       fabricCanvas.remove(obj);
//                       fabricCanvas.renderAll();
//                       break; // remove only first match
//                     }
//                   }
//                 }

//                 // Optional: send to backend
//                 const deletedPayload = {
//                   deleted: [
//                     {
//                       match_class_id: targetClassId,
//                       match_confidence: targetConfidence
//                     }
//                   ]
//                 };

//                 sendDeleteToBackend(deletedPayload);

//                 setSelectedGroup(null);
//               }}
//               className="bg-red-600 text-white px-3 py-1 rounded"
//             >
//               Delete
//             </button>
//           </div>
//         </div>
//       )}

//       <div
//         ref={scrollContainerRef}
//         style={{
//           width: '100%',
//           height: '80%',
//           borderTop: '1px solid #ccc',
//           paddingTop: '20px',
//           display: 'flex',
//           justifyContent: 'center',
//         }}
//       >
//         <div style={{ display: 'inline-block' }}>
//           <canvas ref={canvasRef} />
//         </div>
//       </div>
//     </div>
//   );
// }
