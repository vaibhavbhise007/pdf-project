
// export default Toolbar;
import React from 'react';
import '../styles/Toolbar.css';

const Toolbar = ({ 
  onZoomIn, 
  onZoomOut, 
  onResetZoom, 
  loading, 
  onProcessPDF, 
  onDownloadAnnotations,
  pdfSelected,
  dbReady,
  hasUnsavedChanges, // New prop to show if there are unsaved changes
  pendingUpdates = [], // New prop to show number of pending updates
  pendingDeletes = []  // New prop to show number of pending deletes
}) => {
  const totalPendingChanges = pendingUpdates.length + pendingDeletes.length;
  
  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <h3>PDF Operations</h3>
        <button 
          onClick={onProcessPDF}
          disabled={!pdfSelected || loading}
          className={`process-btn ${dbReady ? "existing" : ""} ${hasUnsavedChanges ? "has-changes" : ""}`}
        >
          {loading ? 'Processing...' : (
            dbReady ? 
              (hasUnsavedChanges ? `Save ${totalPendingChanges} Changes to DB` : 'Database Up to Date') 
              : 'Process PDF'
          )}
        </button>

        {hasUnsavedChanges && (
          <div className="changes-indicator">
            <span className="changes-count">
              📝 {pendingUpdates.length} updates, 🗑️ {pendingDeletes.length} deletes pending
            </span>
          </div>
        )}
      </div>

      <div className="toolbar-section">
        <h3>View Controls</h3>
        <button onClick={onZoomIn}>Zoom In (+)</button>
        <button onClick={onZoomOut}>Zoom Out (-)</button>
        <button onClick={onResetZoom}>Reset View</button>
      </div>

      <div className="toolbar-section">
        <h3>Export</h3>
        <button 
          onClick={onDownloadAnnotations}
          disabled={!dbReady}
        >
          Download Excel
        </button>
      </div>
    </div>
  );
};

export default Toolbar;