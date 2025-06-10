import React from 'react';
import '../styles/AnnotationEditor.css';

const AnnotationEditor = ({ 
  isVisible, 
  editText, 
  onTextChange, 
  onUpdate, 
  onDelete 
}) => {
  if (!isVisible) return null;

  return (
    <div className="annotation-editor">
      <div className="editor-content">
        <div className="editor-input-container">
          <input
            type="text"
            value={editText}
            onChange={(e) => onTextChange(e.target.value)}
            className="editor-input"
          />
        </div>
        <div className="editor-actions">
          <button
            onClick={onUpdate}
            className="update-btn"
          >
            Update
          </button>
          <button
            onClick={onDelete}
            className="delete-btn"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnnotationEditor;