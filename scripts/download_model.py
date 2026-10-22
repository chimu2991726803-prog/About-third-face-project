#!/usr/bin/env python3
"""Download the OFFICIAL MediaPipe Face Landmarker .task model."""
from pathlib import Path
from urllib.request import urlopen

URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
destination = Path(__file__).resolve().parent.parent / "models" / "face_landmarker.task"
destination.parent.mkdir(parents=True, exist_ok=True)
print("正在下载官方 Face Landmarker 模型...\n", URL)
try:
    with urlopen(URL, timeout=90) as response, destination.open("wb") as handle:
        while True:
            data = response.read(1024 * 512)
            if not data:
                break
            handle.write(data)
    if destination.stat().st_size < 100000:
        raise ValueError("文件过小，似乎未下载成功")
    print("下载成功：", destination, destination.stat().st_size, "bytes")
except Exception as e:
    destination.unlink(missing_ok=True)
    print("下载失败：", e)
    print("请检查是否能访问 Google Storage。网页仍可用空格键进行手动测试。")
    raise SystemExit(1)
