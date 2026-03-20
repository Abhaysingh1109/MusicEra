import json
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
SMILE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_smile.xml")
EMOTION_ALIASES = {
    "angry": "angry",
    "disgust": "disgust",
    "disgusted": "disgust",
    "fear": "fear",
    "fearful": "fear",
    "happy": "happy",
    "neutral": "neutral",
    "sad": "sad",
    "surprise": "surprise",
}
EMOTION_WEIGHTS = {
    "happy": 1.35,
    "sad": 1.15,
    "angry": 0.72,
    "surprise": 1.0,
    "fear": 1.0,
    "disgust": 1.0,
    "neutral": 0.58,
}


def warm_emotion_model():
    global MODEL_WARMED

    if MODEL_WARMED:
        return

    try:
        # Load the emotion model once so repeated requests avoid cold-start cost.
        DeepFace.build_model("Emotion")
    except Exception:
        pass

    try:
        blank_frame = np.zeros((224, 224, 3), dtype=np.uint8)
        DeepFace.analyze(
            img_path=blank_frame,
            actions=["emotion"],
            enforce_detection=False,
            detector_backend="opencv",
            silent=True,
        )
    except Exception:
        pass

    MODEL_WARMED = True


def extract_primary_face(frame):
    if max(frame.shape[:2]) > 960:
        scale = 960.0 / float(max(frame.shape[:2]))
        frame = cv2.resize(
            frame,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_AREA,
        )

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    faces = ()
    face_configs = (
        {"scaleFactor": 1.1, "minNeighbors": 6, "minSize": (80, 80)},
        {"scaleFactor": 1.05, "minNeighbors": 5, "minSize": (60, 60)},
    )

    for config in face_configs:
        faces = FACE_CASCADE.detectMultiScale(gray, **config)
        if len(faces) > 0:
            break

    if len(faces) == 0:
        return None

    x, y, w, h = max(faces, key=lambda face: face[2] * face[3])
    margin_x = int(w * 0.28)
    margin_y_top = int(h * 0.35)
    margin_y_bottom = int(h * 0.18)

    x1 = max(0, x - margin_x)
    y1 = max(0, y - margin_y_top)
    x2 = min(frame.shape[1], x + w + margin_x)
    y2 = min(frame.shape[0], y + h + margin_y_bottom)

    face = frame[y1:y2, x1:x2]
    if face.size == 0:
        return None

    face = cv2.resize(face, (224, 224), interpolation=cv2.INTER_AREA)
    face = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
    return face


def detect_smile_strength(face_rgb):
    face_bgr = cv2.cvtColor(face_rgb, cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    lower_half = gray[gray.shape[0] // 2 :, :]

    smiles = SMILE_CASCADE.detectMultiScale(
        lower_half,
        scaleFactor=1.7,
        minNeighbors=22,
        minSize=(40, 20),
    )

    if len(smiles) == 0:
        return 0.0

    _, _, w, h = max(smiles, key=lambda item: item[2] * item[3])
    smile_area = float(w * h)
    lower_half_area = float(lower_half.shape[0] * lower_half.shape[1]) or 1.0
    return min(1.0, smile_area / lower_half_area * 10.0)


def build_emotion_result(analysis, smile_strength=0.0):
    if isinstance(analysis, list):
        analysis = analysis[0]

    raw_emotions = analysis.get("emotion", {})
    normalized_emotions = {}

    for raw_label, raw_score in raw_emotions.items():
        label = EMOTION_ALIASES.get(str(raw_label).lower(), str(raw_label).lower())
        weighted_score = float(raw_score) * EMOTION_WEIGHTS.get(label, 1.0)
        normalized_emotions[label] = normalized_emotions.get(label, 0.0) + weighted_score

    if smile_strength > 0.0:
        normalized_emotions["happy"] = normalized_emotions.get("happy", 0.0) + (
            55.0 * smile_strength
        )
        normalized_emotions["angry"] = normalized_emotions.get("angry", 0.0) * max(
            0.18, 1.0 - (0.85 * smile_strength)
        )
        normalized_emotions["neutral"] = normalized_emotions.get("neutral", 0.0) * max(
            0.25, 1.0 - (0.75 * smile_strength)
        )

    total_score = sum(normalized_emotions.values()) or 1.0
    sorted_emotions = sorted(
        (
            {
                "label": label,
                "score": round((score / total_score) * 100.0, 2),
            }
            for label, score in normalized_emotions.items()
        ),
        key=lambda item: item["score"],
        reverse=True,
    )

    return {
        "dominantEmotion": sorted_emotions[0]["label"] if sorted_emotions else None,
        "emotions": sorted_emotions,
    }


def analyze_image(image_path):
    warm_emotion_model()

    frame = cv2.imread(str(image_path))
    if frame is None:
        return {"error": "Unable to read image"}

    face = extract_primary_face(frame)
    if face is None:
        return {"error": "No clear face detected. Center your face and try again."}

    try:
        analysis = DeepFace.analyze(
            img_path=face,
            actions=["emotion"],
            enforce_detection=False,
            detector_backend="skip",
            silent=True,
        )
    except Exception as exc:
        return {"error": f"DeepFace analysis failed: {exc}"}

    smile_strength = detect_smile_strength(face)
    return build_emotion_result(analysis, smile_strength=smile_strength)


def run_once():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Image path argument is required"}))
        sys.exit(1)

    result = analyze_image(Path(sys.argv[1]))
    print(json.dumps(result), flush=True)
    sys.exit(0 if "error" not in result else 1)


def run_worker():
    warm_emotion_model()

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
        image_path = payload.get("imagePath")
        if not image_path:
            print(
                json.dumps({"id": request_id, "error": "imagePath is required"}),
                flush=True,
            )
            continue

        result = analyze_image(Path(image_path))
        result["id"] = request_id
        print(json.dumps(result), flush=True)


if __name__ == "__main__":
    if "--worker" in sys.argv:
        run_worker()
    else:
        run_once()
