const API_BASE_URL = 'http://localhost:8000';

export const callApi = async (url, options = {}) => {
  console.log(`API call: ${url}`);
  try {
    // Ensure URL starts with /api/ for consistency
    const apiUrl = url.startsWith('/api/') ? url : `/api${url}`;
    const fullUrl = `${API_BASE_URL}${apiUrl}`;
    
    console.log(`Full URL: ${fullUrl}`); // Add this for debugging
    
    const response = await fetch(fullUrl, options);
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`API error (${response.status}): ${text}`);
      
      try {
        return { error: JSON.parse(text) };
      } catch (e) {
        return { error: { message: text || `HTTP ${response.status}` } };
      }
    }
    
    const data = await response.json();
    console.log(`API success:`, data);
    return { data };
  } catch (error) {
    console.error(`API call failed: ${error.message}`);
    return { error: { message: error.message } };
  }
};


export const uploadPDF = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  return callApi('/api/upload', {
    method: 'POST',
    body: formData,
  });
};

export const getGeoJSON = async (filename, pdfId = null) => {
  const query = pdfId ? `pdf_id=${pdfId}` : `filename=${filename}`;
  return callApi(`/api/getGeojson?`);
};


// FIXED: Now properly passes pdf_id for database operations
export const updateAnnotation = async (filename, updatedPayload, pdfId = null) => {
  const query = pdfId ? `pdf_id=${pdfId}` : `filename=${filename}`;
  return callApi(`/api/updateGeojson?${query}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates: [updatedPayload] }),
  });
};

// FIXED: Now properly passes pdf_id for database operations
export const deleteAnnotation = async (filename, payload, pdfId = null) => {
  // trim just in case
  const cleanName = filename.trim();
  const query = pdfId
    ? `pdf_id=${pdfId}`
    : `filename=${encodeURIComponent(cleanName)}`;

  return callApi(`/api/deleteGeojson?${query}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deleted: [payload] }),
  });
};

export const healthCheck = async () => {
  return callApi('/api/healthcheck');
};


// export const loadGeoJSONFile = async (filename) => {
//   return callApi(`/api/getGeojson?filename=${filename}`);
// };


// Add this function to your existing api.js file
export const getClassMappings = async () => {
  return callApi('/api/class-mappings');
};



// apiHelpers.js
export async function storeGeoJSONInDb(pdfId, pageNumber, geojsonObject) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/storeAnnotationsFromGeojson`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pdf_id: pdfId,
        page: pageNumber
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "Failed to store GeoJSON");
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return { error: error.message };
  }
}










