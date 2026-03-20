import json
import sys
import warnings

try:
    from urllib3.exceptions import NotOpenSSLWarning

    warnings.filterwarnings("ignore", category=NotOpenSSLWarning)
except Exception:
    pass

import cv2
from deepface import DeepFace


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Image path argument is required"}))
        sys.exit(1)

    image_path = sys.argv[1]
    frame = cv2.imread(image_path)

    if frame is None:
        print(json.dumps({"error": "Unable to read image"}))
        sys.exit(1)

    try:
        analysis = DeepFace.analyze(
            img_path=frame,
            actions=["emotion"],
            enforce_detection=False,
            detector_backend="opencv",
            silent=True,
        )
    except Exception as exc:
        print(json.dumps({"error": f"DeepFace analysis failed: {exc}"}))
        sys.exit(1)

    if isinstance(analysis, list):
        analysis = analysis[0]

    emotions = analysis.get("emotion", {})
    sorted_emotions = sorted(
        (
            {"label": label, "score": round(float(score), 2)}
            for label, score in emotions.items()
        ),
        key=lambda item: item["score"],
        reverse=True,
    )

    dominant_emotion = analysis.get("dominant_emotion")

    print(
        json.dumps(
            {
                "dominantEmotion": dominant_emotion,
                "emotions": sorted_emotions,
            }
        )
    )


if __name__ == "__main__":
    main()
