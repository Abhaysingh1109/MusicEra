import json
import math
import sys
import warnings
from pathlib import Path

try:
    from urllib3.exceptions import NotOpenSSLWarning

    warnings.filterwarnings("ignore", category=NotOpenSSLWarning)
except Exception:
    pass

import cv2
import numpy as np
from deepface import DeepFace


MODEL_WARMED = False
FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)
EYE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")


def warm_face_model():
    global MODEL_WARMED

    if MODEL_WARMED:
        return

    try:
        DeepFace.build_model("Facenet512")
    except Exception:
        pass

    try:
        blank_frame = np.zeros((224, 224, 3), dtype=np.uint8)
        DeepFace.represent(
            img_path=blank_frame,
            model_name="Facenet512",
            enforce_detection=False,
            detector_backend="skip",
            normalization="Facenet2018",
        )
    except Exception:
        pass

    MODEL_WARMED = True


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def detect_primary_face(frame_bgr):
    resized = frame_bgr
    scale = 1.0

    if max(frame_bgr.shape[:2]) > 1280:
        scale = 1280.0 / float(max(frame_bgr.shape[:2]))
        resized = cv2.resize(
            frame_bgr,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_AREA,
        )

    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    faces = FACE_CASCADE.detectMultiScale(
        gray,
        scaleFactor=1.08,
        minNeighbors=6,
        minSize=(90, 90),
    )

    if len(faces) == 0:
        return None, "No clear face detected. Keep your face in the center."

    if len(faces) > 1:
        return None, "Only one face can be visible during scanning."

    x, y, w, h = faces[0]
    if scale != 1.0:
        x = int(round(x / scale))
        y = int(round(y / scale))
        w = int(round(w / scale))
        h = int(round(h / scale))

    return (x, y, w, h), None


def analyze_face_quality(frame_bgr, face_box):
    frame_height, frame_width = frame_bgr.shape[:2]
    x, y, w, h = face_box

    face_area_ratio = (w * h) / float(frame_width * frame_height or 1)
    if face_area_ratio < 0.10:
        return None, "Move closer to the camera so your face fills more of the scan area."

    center_x = x + (w / 2.0)
    center_y = y + (h / 2.0)
    offset_x = abs(center_x - (frame_width / 2.0)) / float(frame_width or 1)
    offset_y = abs(center_y - (frame_height / 2.0)) / float(frame_height or 1)

    if offset_x > 0.18 or offset_y > 0.2:
        return None, "Center your face inside the scan guide."

    margin_x = int(w * 0.34)
    margin_top = int(h * 0.38)
    margin_bottom = int(h * 0.24)

    x1 = max(0, x - margin_x)
    y1 = max(0, y - margin_top)
    x2 = min(frame_width, x + w + margin_x)
    y2 = min(frame_height, y + h + margin_bottom)

    face_crop = frame_bgr[y1:y2, x1:x2]
    if face_crop.size == 0:
        return None, "Unable to isolate the face region from the camera frame."

    roi_gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    roi_gray = cv2.equalizeHist(roi_gray)
    eyes = EYE_CASCADE.detectMultiScale(
        roi_gray,
        scaleFactor=1.08,
        minNeighbors=8,
        minSize=(20, 20),
    )

    eye_count = len(eyes)
    if eye_count < 1:
        return None, "Keep your face fully visible and look toward the camera."

    quality_score = (
        clamp(face_area_ratio / 0.2, 0.0, 1.0) * 0.55
        + clamp(1.0 - ((offset_x + offset_y) * 2.2), 0.0, 1.0) * 0.3
        + clamp(eye_count / 2.0, 0.0, 1.0) * 0.15
    )

    return (
        {
            "crop": face_crop,
            "quality_score": round(quality_score * 100.0, 2),
            "face_area_ratio": round(face_area_ratio, 4),
            "eye_count": int(eye_count),
            "box": {
                "x": int(x),
                "y": int(y),
                "width": int(w),
                "height": int(h),
            },
        },
        None,
    )


def build_embedding(face_bgr):
    face_rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)

    result = DeepFace.represent(
        img_path=face_rgb,
        model_name="Facenet512",
        enforce_detection=False,
        detector_backend="skip",
        normalization="Facenet2018",
    )

    if isinstance(result, list):
        result = result[0] if result else {}

    embedding = result.get("embedding")
    if not embedding:
        raise ValueError("Face embedding could not be generated.")

    vector = np.array(embedding, dtype=np.float32)
    norm = float(np.linalg.norm(vector))
    if not math.isfinite(norm) or norm <= 0:
        raise ValueError("Invalid face embedding generated.")

    vector = vector / norm
    return vector.tolist()


def analyze_images(image_paths):
    warm_face_model()

    embeddings = []
    quality_scores = []
    boxes = []

    for image_path in image_paths:
        frame = cv2.imread(str(image_path))
        if frame is None:
            return {"error": f"Unable to read image: {image_path}"}

        face_box, detect_error = detect_primary_face(frame)
        if detect_error:
            return {"error": detect_error}

        quality_info, quality_error = analyze_face_quality(frame, face_box)
        if quality_error:
            return {"error": quality_error}

        try:
            embedding = build_embedding(quality_info["crop"])
        except Exception as exc:
            return {"error": f"Face embedding failed: {exc}"}

        embeddings.append(embedding)
        quality_scores.append(float(quality_info["quality_score"]))
        boxes.append(quality_info["box"])

    if not embeddings:
        return {"error": "No valid face samples were captured."}

    averaged_embedding = np.mean(np.array(embeddings, dtype=np.float32), axis=0)
    embedding_norm = float(np.linalg.norm(averaged_embedding))
    if not math.isfinite(embedding_norm) or embedding_norm <= 0:
        return {"error": "Averaged face embedding is invalid."}

    averaged_embedding = averaged_embedding / embedding_norm

    return {
        "embedding": averaged_embedding.tolist(),
        "qualityScore": round(sum(quality_scores) / len(quality_scores), 2),
        "samplesUsed": len(embeddings),
        "faceBoxes": boxes,
    }


def run_once():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Image path argument is required"}))
        sys.exit(1)

    result = analyze_images([Path(sys.argv[1])])
    print(json.dumps(result), flush=True)
    sys.exit(0 if "error" not in result else 1)


def run_worker():
    warm_face_model()

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            print(
                json.dumps({"id": None, "error": "Invalid worker payload"}),
                flush=True,
            )
            continue

        request_id = payload.get("id")
        image_paths = payload.get("imagePaths") or []
        if not image_paths:
            print(
                json.dumps({"id": request_id, "error": "imagePaths is required"}),
                flush=True,
            )
            continue

        result = analyze_images([Path(image_path) for image_path in image_paths])
        result["id"] = request_id
        print(json.dumps(result), flush=True)


if __name__ == "__main__":
    if "--worker" in sys.argv:
        run_worker()
    else:
        run_once()
