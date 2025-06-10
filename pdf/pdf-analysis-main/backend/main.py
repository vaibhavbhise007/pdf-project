import os
import shutil
import fitz  # PyMuPDF
import pandas as pd
from fastapi.responses import FileResponse
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from io import BytesIO
import json
import cv2
import numpy as np
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import datetime
import sqlite3
import tempfile
import os
import json
from ultralytics import YOLO
from typing import List  # ✅ FIXED
import re
from fastapi import APIRouter# your SQLAlchemy model or schema
from pydantic import BaseModel
from models import ResultModel
from database import get_db
from fastapi import UploadFile, File, APIRouter
import time
import random

app = FastAPI()
router = APIRouter()

class Result(BaseModel):
    id: int
    pdf_id: int
    class_id: int
    class_name: str
    count: int

class CompareResponse(BaseModel):
    results: List[dict] = []
    error: str = None

UPLOAD_DIRECTORY = "uploads"
OUTPUT_DIR = "outputs"
PROCESSED_IMAGE_DIR = "processed_images"
DATABASE_FILE = os.path.join(os.path.dirname(__file__), "annotations.db")


app.add_middleware(
    CORSMiddleware,
    # allow_origins=["*"],  # Or restrict to your frontend domain
    allow_origins=["http://localhost:3000"],  # ✅ match your frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure directories exist
os.makedirs(UPLOAD_DIRECTORY, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(PROCESSED_IMAGE_DIR, exist_ok=True)

# Serve static files
app.mount("/processed_image", StaticFiles(directory=PROCESSED_IMAGE_DIR), name="processed_images")
app.mount("/annotations", StaticFiles(directory=OUTPUT_DIR), name="annotations")

CLASS_ID_TO_NAME = {
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
  }

# Database initialization
def init_db():
    try:
        print("📦 Initializing database...")
        conn = sqlite3.connect(DATABASE_FILE)
        cursor = conn.cursor()
        
        # Create pdfs table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS pdfs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL UNIQUE,
            page_count INTEGER NOT NULL DEFAULT 1,
            created_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """)
        print("✅ Created pdfs table")
        
        # Create annotations table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS annotations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pdf_id INTEGER NOT NULL,
            page_number INTEGER NOT NULL DEFAULT 1,
            class_id INTEGER NOT NULL,
            confidence REAL NOT NULL,
            component_name TEXT,
            renamed_name TEXT,
            renamed_timestamp DATETIME,
            created_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_modified_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pdf_id) REFERENCES pdfs(id) ON DELETE CASCADE
        )
        """)
        print("✅ Created annotations table")
        
        # Create annotation_geometries table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS annotation_geometries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            annotation_id INTEGER NOT NULL,
            coordinates_json TEXT NOT NULL,
            FOREIGN KEY (annotation_id) REFERENCES annotations(id) ON DELETE CASCADE
        )
        """)
        print("✅ Created annotation_geometries table")

        # Create annotation counts table
        # cursor.execute("""
        # CREATE TABLE IF NOT EXISTS annotation_counts (
        #     id INTEGER PRIMARY KEY AUTOINCREMENT,
        #     pdf_id INTEGER NOT NULL,
        #     page_number INTEGER NOT NULL,
        #     class_id INTEGER NOT NULL,
        #     class_name TEXT NOT NULL,
        #     count INTEGER NOT NULL,
        #     FOREIGN KEY (pdf_id) REFERENCES pdfs(id) ON DELETE CASCADE
        # )
        # """)
        # print("✅ Created annotation_counts table")
        
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS count (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER NOT NULL,
        component_name TEXT NOT NULL,
        count INTEGER NOT NULL
        );
        ''')

        
        conn.commit()
        print("✅ Database initialized successfully")
        
    except Exception as e:
        print(f"❌ Error initializing database: {str(e)}")
        raise
    finally:
        if 'conn' in locals():
            conn.close()

# Initialize database on startup
print("🚀 Starting application...")
init_db()
print("✅ Application started successfully")

# Database utility functions
def get_db_connection():
    """Create and return a database connection"""
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row  # This enables column access by name
    return conn

def add_pdf_to_db(filename, page_count=1):
    """Add a PDF file to the database and return its ID"""
    print(f"✅ add_pdf_to_db called with: {filename}, pages: {page_count}")

    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        "INSERT INTO pdfs (filename, page_count) VALUES (?, ?)",
        (filename, page_count)
    )
    pdf_id = cursor.lastrowid
    
    conn.commit()
    print(f"📌 Inserted PDF row with ID: {cursor.lastrowid}")

    conn.close()
    
    return pdf_id

   
def store_annotations(pdf_id, page_number, annotations):
    """Store annotations in the database"""
    conn = get_db_connection()
    cursor = conn.cursor()

    timestamp = datetime.datetime.now().isoformat()

    features = annotations.get("features", [])
    print(f"🧠 Storing {len(features)} features for PDF ID {pdf_id}, Page {page_number}")

    for feature in features:
        try:
            properties = feature.get("properties", {})
            geometry = feature.get("geometry", {})
            cls_id = int(properties.get("class_id", 0))
            confidence = float(properties.get("confidence", 0.0))
            # component_name = component_map.get(cls_id, "UNKNOWN")
            component_name = CLASS_ID_TO_NAME.get(cls_id, "UNKNOWN")  # Use global mapping


            print(f"➕ Adding class_id={cls_id}, confidence={confidence}, component={component_name}")

            cursor.execute(
                """
                INSERT INTO annotations 
                (pdf_id, page_number, class_id, confidence, component_name, created_timestamp, last_modified_timestamp) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pdf_id,
                    page_number,
                    cls_id,
                    confidence,
                    component_name,
                    timestamp,
                    timestamp
                )
            )
            annotation_id = cursor.lastrowid
            print(f"✅ Inserted annotation ID {annotation_id}")

            # Geometry insert
            if geometry and 'coordinates' in geometry:
                cursor.execute(
                    "INSERT INTO annotation_geometries (annotation_id, coordinates_json) VALUES (?, ?)",
                    (annotation_id, json.dumps(geometry['coordinates']))
                )
                print(f"📐 Inserted geometry for annotation ID {annotation_id}")
            else:
                print("⚠️ Geometry missing")

        except Exception as e:
            print(f"❌ Error inserting annotation: {e}")

    conn.commit()
    conn.close()

def get_class_counts():
    """
    Connects to SQLite, runs the GROUP BY query to count per class,
    and returns a list of dicts: [{ "class_id": ..., "count": ... }, ...]
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    query = """
        SELECT
            class_id,
            COUNT(*) as count
        FROM annotations
        GROUP BY class_id
    """
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    # rows will be a list of tuples: [(class_id1, count1), (class_id2, count2), ...]
    result = []
    for class_id, count in rows:
        result.append({
            "class_id": class_id,
            "count": count,
            "class_name": CLASS_ID_TO_NAME.get(class_id, "Unknown")
        })
    return result

@app.get("/api/class-counts")
async def get_class_counts_endpoint():
    """
    Returns the count of annotations for each class ID
    Example response:
    [
        {"class_id": 1, "count": 5, "class_name": "1"},
        {"class_id": 2, "count": 3, "class_name": "2"},
        ...
    ]
    """ 
    try:
        counts = get_class_counts()
        return counts
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting class counts: {str(e)}")

@app.get("/api/download-annotations")
def download_annotations():
    conn = get_db_connection()
    df = pd.read_sql_query("SELECT * FROM annotations", conn)
    conn.close()

    # Create a temporary Excel file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        tmp_path = tmp.name
        df.to_excel(tmp_path, index=False)

    return FileResponse(tmp_path, filename="annotations_export.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

def get_annotations_for_pdf(pdf_id, page_number=None):
    """Retrieve annotations for a PDF, optionally filtered by page number"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT a.id, a.class_id, a.confidence, a.page_number, a.renamed_name, g.coordinates_json
    FROM annotations a
    JOIN annotation_geometries g ON a.id = g.annotation_id
    WHERE a.pdf_id = ?
    """
    params = [pdf_id]
    id = 1
    if page_number is not None:
        query += " AND a.page_number = ?"
        params.append(page_number)
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    # Convert to GeoJSON format
    geojson = {
        "type": "FeatureCollection",
        "features": []
    }
    for row in rows:
        coords = json.loads(row['coordinates_json'])
        geojson['features'].append({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": coords
            },
            "properties": {
                "annotation_id": row['id'],                   # ← your DB PK
                "class_id":      row['class_id'],
                "confidence":    row['confidence'],            # ← full precision
                "page":          row['page_number'],
                "renamed_name":  row['renamed_name']
            }
        })

    
    conn.close()
    return geojson


def update_annotation(annotation_id, new_class_id=None, renamed_name=None):

    conn = get_db_connection()
    cursor = conn.cursor()

    update_fields = []
    params = []

    if new_class_id is not None:
        update_fields.append("class_id = ?")
        params.append(new_class_id)

    if renamed_name is not None:
        update_fields.append("renamed_name = ?")
        update_fields.append("renamed_timestamp = ?")
        params.append(renamed_name)
        params.append(datetime.datetime.now().isoformat())

    update_fields.append("last_modified_timestamp = ?")
    params.append(datetime.datetime.now().isoformat())
    params.append(annotation_id)

    query = f"UPDATE annotations SET {', '.join(update_fields)} WHERE id = ?"
    cursor.execute(query, params)
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def delete_annotation(pdf_id, class_id, confidence):
    """Delete an annotation from the database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Find the annotation
    cursor.execute(
        "SELECT id FROM annotations WHERE pdf_id = ? AND class_id = ? AND ABS(confidence - ?) < 0.0001",
        (pdf_id, class_id, confidence)
    )
    row = cursor.fetchone()
    
    if row:
        annotation_id = row['id']
        
        # Delete the annotation (geometry will be deleted via CASCADE)
        cursor.execute("DELETE FROM annotations WHERE id = ?", (annotation_id,))
        
        conn.commit()
        result = True
    else:
        result = False
    
    conn.close()
    return result


def convert_detections_to_geojson(detections: List[dict]) -> dict:
    features = []
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        feature = {
            "type": "Feature",
            "properties": {
                "class_id": det["class_id"],
                "confidence": det["confidence"]
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]
                ]]
            }
        }
        features.append(feature)
    return {"type": "FeatureCollection", "features": features}

def run_yolo_on_image(image_path, model_paths):
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Image not found: {image_path}")

    window_size = 960
    stride = 720
    all_detections = []

    for model_path in model_paths:
        model = YOLO(model_path)
        model_name = os.path.basename(model_path)
        h, w = img.shape[:2]

        # ✅ Assign offset based on which model is running
        class_id_offset = 0
        if model_name == "best_s.pt":
            class_id_offset = 6

        for y in range(0, h, stride):
            for x in range(0, w, stride):
                patch = img[y:min(y + window_size, h), x:min(x + window_size, w)].copy()
                results = model.predict(source=patch, conf=0.6, save=False, device='cpu')

                for result in results:
                    boxes = result.boxes
                    if boxes is None or boxes.shape[0] == 0:
                        continue

                    for cls_id, conf, (x1, y1, x2, y2) in zip(
                        boxes.cls.tolist(),
                        boxes.conf.tolist(),
                        boxes.xyxy.tolist()
                    ):
                        global_x1 = int(x1 + x)
                        global_y1 = int(y1 + y)
                        global_x2 = int(x2 + x)
                        global_y2 = int(y2 + y)
                      
                        all_detections.append({
                            "model": model_name,
                            "class_id": int(cls_id) + class_id_offset,
                            "class_name": model.names[int(cls_id)],
                            "confidence": float(conf),
                            "bbox": [global_x1, global_y1, global_x2, global_y2]
                        })


    # NMS
    def apply_nms(detections, iou_thresh=0.5):
        boxes = np.array([[d["bbox"][0], d["bbox"][1], d["bbox"][2] - d["bbox"][0], d["bbox"][3] - d["bbox"][1]] for d in detections])
        scores = np.array([d["confidence"] for d in detections])
        indices = cv2.dnn.NMSBoxes(boxes.tolist(), scores.tolist(), score_threshold=0.7, nms_threshold=iou_thresh)
        return [detections[i] for i in indices.flatten()] if len(indices) > 0 else []

    final_detections = apply_nms(all_detections)
    return final_detections


@app.get("/api/getGeojson")
async def get_geojson(
    filename: str = "annotations_page_1.geojson",
    pdf_id: int = None,
    page: int = None
):
    if pdf_id is not None:
        geojson = get_annotations_for_pdf(pdf_id, page)
        if not geojson['features']:
            # Return empty GeoJSON structure instead of 404
            return {
                "type": "FeatureCollection",
                "features": []
            }
        return geojson

    # 👇 Try to extract page from filename if not provided
    if page is None:
        match = re.search(r'page_(\d+)', filename)
        if match:
            page = int(match.group(1))
        else:
            raise HTTPException(status_code=400, detail="Page not provided and could not be inferred from filename")

    image_path = os.path.join(PROCESSED_IMAGE_DIR, f"page_{page}.png")
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail=f"Image for page {page} not found")

    try:
        detections = run_yolo_on_image(image_path, ["model/best_C.pt", "model/best_s.pt"])
        geojson_result = convert_detections_to_geojson(detections)

        os.makedirs(OUTPUT_DIR, exist_ok=True)
        geojson_path = os.path.join(OUTPUT_DIR, filename)
        with open(geojson_path, "w") as f:
            json.dump(geojson_result, f, indent=2)

        return geojson_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during YOLO inference: {str(e)}")



# Fixed backend upload to handle existing PDFs

def check_existing_pdf(filename):
    """Check if PDF already exists in database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, page_count FROM pdfs WHERE filename = ?", (filename,))
    row = cursor.fetchone()
    
    conn.close()
    return dict(row) if row else None


def clear_all_old_data():
    """Clear all PDF and annotation data from database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Delete all annotations and geometries (CASCADE will handle geometries)
        cursor.execute("DELETE FROM annotations")
        print(f"🗑️ Deleted all annotations")
        
        # Delete all PDFs
        cursor.execute("DELETE FROM pdfs")
        print(f"🗑️ Deleted all PDFs")
        
        conn.commit()
        print("✅ Database cleared successfully")
        
    except Exception as e:
        print(f"❌ Error clearing database: {e}")
        conn.rollback()
    finally:
        conn.close()

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_location = os.path.join(UPLOAD_DIRECTORY, file.filename)
        
        # Check if this PDF already exists in database
        existing_pdf = check_existing_pdf(file.filename)
        pdf_id = None
        
        if existing_pdf:
            # PDF already exists, get its ID
            pdf_id = existing_pdf['id']
            print(f"📋 PDF '{file.filename}' already exists with ID {pdf_id}")
        else:
        # NEW PDF: Clear all old data before processing
            print(f"🗑️ NEW PDF detected: '{file.filename}'. Clearing old database data...")
        clear_all_old_data()
            # Add new PDF to database
        pdf_id = add_pdf_to_db(file.filename, page_count=1)

        # Always save the uploaded file
        with open(file_location, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Open PDF and process first page
        doc = fitz.open(file_location)
        
        # Process first page only
        page = doc[0]
        print(f"\n📄 Processing Page 1...")

        # Remove visible text
        page_text_data = []
        text_dict = page.get_text("dict")
        for block in text_dict.get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    x0, y0, x1, y1 = span["bbox"]
                    rect = fitz.Rect(x0, y0, x1, y1)
                    page_text_data.append((rect, span["text"], span.get("size", 10),
                                       span.get("font", "helv"), span.get("color", 0)))
                    page.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1))

        # Desired DPI
            dpi = 300
        scale = dpi / 72

        # Calculate pixel dimensions to match PDF page
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)

        # Save image
        image_path = os.path.join(PROCESSED_IMAGE_DIR, f"page_1.png")
        pix.save(image_path)

        print(f"✅ Saved image: {image_path} with size {pix.width}x{pix.height}")

        return {
            "message": "PDF processed successfully",
            "pdf_id": pdf_id,
            "is_existing": existing_pdf is not None
        }

    except Exception as e:
        return {"error": f"Failed to process PDF: {str(e)}"}
        
def remove_all_text_from_page(page):
    """Remove all text from a PDF page by drawing white rectangles over text areas"""
    text_dict = page.get_text("dict")
    for block in text_dict.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                x0, y0, x1, y1 = span["bbox"]
                rect = fitz.Rect(x0, y0, x1, y1)
                page.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1))

# Fixed API functions for proper database operations                   

@app.get("/api/class-mappings")
async def get_class_mappings():
    return {"mappings": CLASS_ID_TO_NAME}

\

@app.put("/api/updateGeojson")
async def update_properties(request: Request,
                            filename: str = "annotations_page_1.geojson",
                            pdf_id:   int   = None):
    """
    Expects:
      {"updates":[
         {"match_class_id":3,"match_confidence":0.8421,"new_class_id":5,"renamed_name":"Foo"},
         …
       ]}
    """
    body    = await request.json()
    updates = body.get("updates", [])
    if not updates:
        raise HTTPException(400, "No updates provided")

    # 1) Update SQLite rows if pdf_id passed (unchanged)
    db_updated = 0
    conn = get_db_connection()
    cur  = conn.cursor()
    now = datetime.datetime.utcnow().isoformat()

    for upd in updates:
        match_cid        = upd.get("match_class_id")
        match_confidence = float(upd.get("match_confidence", 0))
        new_class_id     = upd.get("new_class_id")

        if match_cid is None or new_class_id is None:
            continue

        # 1) Fetch all rows with that old class_id
        cur.execute(
            "SELECT id, confidence FROM annotations WHERE pdf_id = ? AND class_id = ?",
            (pdf_id, match_cid)
        )
        rows = cur.fetchall()

        # 2) Find the first whose rounded confidence matches
        for row in rows:
            stored_conf = float(row["confidence"])
            if round(stored_conf, 4) == match_confidence:
                # 3) Update that single row
                cur.execute(
                    """
                    UPDATE annotations
                    SET class_id               = ?,
                        last_modified_timestamp = ?
                    WHERE id = ?
                    """,
                    (new_class_id, now, row["id"])
                )
                db_updated += cur.rowcount
                break
        conn.commit()
        conn.close()

    # 2) Update the on‐disk GeoJSON using round(conf,4) matching
    geojson_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(geojson_path):
        raise HTTPException(404, "GeoJSON file not found")

    with open(geojson_path, "r") as f:
        gj = json.load(f)

    file_updated = 0
    now = datetime.datetime.utcnow().isoformat()

    for upd in updates:
        match_cid        = upd.get("match_class_id")
        match_confidence = upd.get("match_confidence")
        new_class_id     = upd.get("new_class_id")

        if match_cid is None or match_confidence is None or new_class_id is None:
            continue

        # loop features and match by rounded confidence
        for feature in gj.get("features", []):
            props = feature.setdefault("properties", {})
            if (
                props.get("class_id") == match_cid and
                round(float(props.get("confidence", 0)), 4) == float(match_confidence)
            ):
                props["class_id"]               = new_class_id
                props["last_modified_timestamp"] = now
                file_updated += 1
                break

    # 3) Write the file back if anything changed
    if file_updated:
        with open(geojson_path, "w") as f:
            json.dump(gj, f, indent=2)

    return JSONResponse({
        "message": (
            f"✅ Database updated: {db_updated} row(s); "
            f"GeoJSON updated: {file_updated} feature(s)."
            if db_updated or file_updated
            else "⚠️ No matching annotation found."
        ),
        "db_updated":   db_updated,
        "file_updated": file_updated
    })



@app.delete("/api/deleteGeojson")
async def delete_feature(
    request: Request,
    filename: str = "annotations_page_1.geojson",
    pdf_id: int = None
):
    filename = filename.strip()
    body    = await request.json()
    deletes = body.get("deleted", [])
    if not deletes:
        raise HTTPException(400, "No delete targets provided")

    # 1) Delete from file
    geojson_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(geojson_path):
        raise HTTPException(404, f"GeoJSON not found at {geojson_path}")

    with open(geojson_path, "r") as f:
        gj = json.load(f)

    before     = len(gj["features"])
    remaining  = []
    # also collect which (class_id, confidence) pairs we removed
    removed    = []
    for feat in gj["features"]:
        props = feat.get("properties", {})
        should_delete = any(
            props.get("class_id") == t["match_class_id"] and
            abs(float(props.get("confidence",0)) - float(t["match_confidence"])) < 1e-4
            for t in deletes
        )
        if should_delete:
            removed.append((props.get("class_id"), props.get("confidence")))
        else:
            remaining.append(feat)

    gj["features"] = remaining
    file_deleted = before - len(remaining)
    if file_deleted:
        with open(geojson_path, "w") as f:
            json.dump(gj, f, indent=2)

    # 2) Delete from DB
    db_deleted = 0
    if pdf_id is not None:
        for cid, conf in removed:
            if delete_annotation(pdf_id, cid, conf):
                db_deleted += 1

    return JSONResponse({
        "message":        f"✅ Deleted {file_deleted} feature(s); {db_deleted} row(s) removed.",
        "file_deleted":   file_deleted,
        "db_deleted":     db_deleted
    })


# Add this after your existing endpoints, before the if __name__ == "__main__": section
@app.get("/api/healthcheck")
async def health_check():
    try:
        # Check database connection
        conn = sqlite3.connect(DATABASE_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        conn.close()

        # Check upload directory
        os.makedirs(UPLOAD_DIRECTORY, exist_ok=True)

        return {
            "status": "healthy",
            "database": "connected",
            "upload_directory": "ready",
            "timestamp": time.time()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": time.time()
        }


@app.get("/api/refreshAnnotations")
async def refresh_annotations(pdf_id: int):
    """Get fresh annotations from database for a PDF"""
    print(f"🔄 Refresh request for PDF ID: {pdf_id}")
    
    if not pdf_id:
        raise HTTPException(status_code=400, detail="pdf_id parameter is required")
    
    try:
        # Check if PDF exists
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT id, filename FROM pdfs WHERE id = ?", (pdf_id,))
        pdf_row = cursor.fetchone()
        
        if not pdf_row:
            conn.close()
            raise HTTPException(status_code=404, detail=f"PDF with ID {pdf_id} not found")
        
        conn.close()
        
        # Get annotations using existing function
        geojson = get_annotations_for_pdf(pdf_id)
        
        if not geojson['features']:
            print(f"⚠️ No annotations found for PDF ID {pdf_id}")
            # Return empty structure instead of 404
            return {
                "type": "FeatureCollection",
                "features": []
            }
        
        print(f"✅ Retrieved {len(geojson['features'])} annotations for PDF ID {pdf_id}")
        return geojson
        
    except HTTPException:
        # Re-raise HTTP exceptions (like 404)
        raise
    except Exception as e:
        print(f"❌ Error refreshing annotations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error refreshing annotations: {str(e)}")

@app.post("/api/storeAnnotationsFromGeojson")
async def store_annotations_from_geojson(request: Request):
    """
    Store annotations from GeoJSON file into both annotations and annotation_counts tables.
    Expects JSON body:
      { "pdf_id": int, "page": int }
    """
    try:
        body = await request.json()
        pdf_id = body.get("pdf_id")
        page_number = body.get("page")

        # 1) Validate inputs
        if pdf_id is None or page_number is None:
            raise HTTPException(
                status_code=400,
                detail="Missing required fields: 'pdf_id' and 'page'."
            )

        # 2) Verify that pdf_id exists
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM pdfs WHERE id = ?", (pdf_id,))
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(
                status_code=404,
                detail=f"PDF with id={pdf_id} not found."
            )

        # 3) Construct geojson filepath
        geojson_filename = f"annotations_page_{page_number}.geojson"
        geojson_path = os.path.join(OUTPUT_DIR, geojson_filename)
        if not os.path.exists(geojson_path):
            conn.close()
            raise HTTPException(
                status_code=404,
                detail=f"GeoJSON file not found: {geojson_filename}"
            )

        # 4) Load GeoJSON
        with open(geojson_path, "r") as f:
            geojson_data = json.load(f)

        features = geojson_data.get("features", [])
        if not isinstance(features, list):
            conn.close()
            raise HTTPException(
                status_code=400,
                detail="GeoJSON missing a valid 'features' array."
            )

        # 5) Store annotations and count them
        from collections import defaultdict
        total_count = defaultdict(int)
        stored_annotations = 0

        for feature in features:
            try:
                properties = feature.get("properties", {})
                geometry = feature.get("geometry", {})
                cls_id = int(properties.get("class_id", 0))
                confidence = float(properties.get("confidence", 0.0))
                component_name = CLASS_ID_TO_NAME.get(cls_id, "UNKNOWN")

                # Store in annotations table
                cursor.execute(
                    """
                    INSERT INTO annotations 
                    (pdf_id, page_number, class_id, confidence, component_name, created_timestamp, last_modified_timestamp) 
                    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                    """,
                    (pdf_id, page_number, cls_id, confidence, component_name)
                )
                annotation_id = cursor.lastrowid

                # Store geometry
                if geometry and 'coordinates' in geometry:
                    cursor.execute(
                        "INSERT INTO annotation_geometries (annotation_id, coordinates_json) VALUES (?, ?)",
                        (annotation_id, json.dumps(geometry['coordinates']))
                    )

                total_count[cls_id] += 1
                stored_annotations += 1

            except Exception as e:
                print(f"Error storing annotation: {e}")
                continue

        # # 6) Store counts in annotation_counts table
        # for cls_id, cnt in total_count.items():
        #     cls_name = CLASS_ID_TO_NAME.get(cls_id, "UNKNOWN")
        #     cursor.execute(
        #         """
        #         INSERT INTO annotation_counts
        #         (pdf_id, page_number, class_id, class_name, count)
        #         VALUES (?, ?, ?, ?, ?)
        #         """,
        #         (pdf_id, page_number, cls_id, cls_name, cnt)
        #     )

        for cls_id, cnt in total_count.items():
            cls_name = CLASS_ID_TO_NAME.get(cls_id, "UNKNOWN")
            cursor.execute(
                """
                INSERT INTO count (class_id, component_name, count)
                VALUES (?, ?, ?)
                """,
                (cls_id, cls_name, cnt)
            )

        conn.commit()
        conn.close()

        return JSONResponse(
            {
                "message": (
                    f"✅ Stored {stored_annotations} annotations and {len(total_count)} class counts "
                    f"for PDF {pdf_id}, page {page_number}."
                ),
                "stored_annotations": stored_annotations,
                "class_counts": dict(total_count)
            },
            status_code=201
        )

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to store annotations: {str(e)}"
        )
    
@router.get("/api/getResults", response_model=List[Result])
def get_results():
    db = get_db()
    results = db.query(Result).all()
    return results

@app.get("/api/compare-excel/")
async def compare_excel_get():
    try:
        # Connect to SQLite and fetch data from the count table
        conn = sqlite3.connect(DATABASE_FILE)
        db_df = pd.read_sql_query("SELECT component_name, class_id, count FROM count", conn)
        conn.close()

        if db_df.empty:
            return {"error": "No data found in database. Please process a PDF first."}

        # Convert to dict and handle NaN values
        results = db_df.replace({pd.NA: None, pd.NaT: None, float('nan'): None}).to_dict(orient='records')
        
        return {"results": results}
        
    except Exception as e:
        return {"error": f"Failed to fetch data from database: {str(e)}"}



# Include the router in the app
app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

