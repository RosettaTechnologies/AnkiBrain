"""
Screen capture for the demo pipeline.

Two backends, chosen by `demo/config.json` (or ANKIBRAIN_DEMO_CAPTURE):

    x11   - `import -window <winId>` (ImageMagick). Captures what the X server
            actually composited, which is the only way QtWebEngine content is
            reliably present on screen.
    grab  - QWidget.grab(), fully in-process, no X client needed.
    auto  - try x11, fall back to grab when the file is missing/undecodable.

A crop rectangle is in logical widget coordinates and is scaled by the widget's
devicePixelRatioF() before it is applied to the captured image, so a
fractional-scale desktop still yields a correctly framed region.
"""

import subprocess
from os import path

from aqt.qt import *

BACKENDS = ('auto', 'x11', 'grab')


class CaptureError(Exception):
    pass


class Capture:
    def __init__(self, backend='auto', log=print):
        backend = (backend or 'auto').strip().lower()
        if backend not in BACKENDS:
            raise CaptureError(f'unknown capture backend {backend!r}')
        self.backend = backend
        self.log = log
        self.last_backend = None

    # ── image helpers ──────────────────────────────────────────────────────
    @staticmethod
    def dpr(widget) -> float:
        try:
            return float(widget.devicePixelRatioF() or 1.0)
        except Exception:
            return 1.0

    @staticmethod
    def scaled(rect: QRect, ratio: float) -> QRect:
        return QRect(int(round(rect.x() * ratio)), int(round(rect.y() * ratio)),
                     int(round(rect.width() * ratio)), int(round(rect.height() * ratio)))

    # ── backends ───────────────────────────────────────────────────────────
    def _capture_x11(self, widget, target) -> bool:
        try:
            window_id = int(widget.winId())
        except Exception as exc:
            self.log(f'capture: no winId for {widget!r}: {exc}')
            return False
        try:
            result = subprocess.run(
                ['import', '-window', str(window_id), target],
                capture_output=True, timeout=60)
        except Exception as exc:
            self.log(f'capture: import failed to run: {exc}')
            return False
        if result.returncode != 0:
            self.log('capture: import rc=%s %s' % (result.returncode,
                                                   result.stderr.decode('utf-8', 'replace')[:200]))
            return False
        if not path.isfile(target):
            return False
        image = QImage(target)
        if image.isNull():
            self.log('capture: import produced an undecodable image')
            return False
        return True

    def _capture_grab(self, widget, target) -> bool:
        pixmap = widget.grab()
        if pixmap.isNull():
            return False
        return bool(pixmap.save(target, 'PNG'))

    # ── public API ─────────────────────────────────────────────────────────
    def capture(self, widget, target, crop: 'QRect | None' = None) -> dict:
        """
        Capture `widget` to `target` (PNG), optionally cropped. Returns
        {'backend', 'file', 'size': [w, h], 'crop': [x, y, w, h] | None}.
        """
        if widget is None:
            raise CaptureError('capture: no widget')
        # x11 is the backend that can see QtWebEngine content, with grab() as
        # the in-process fallback when ImageMagick is unavailable or the window
        # id cannot be captured; 'grab' pins the in-process path only.
        order = ['grab'] if self.backend == 'grab' else ['x11', 'grab']
        used = None
        for backend in order:
            ok = self._capture_x11(widget, target) if backend == 'x11' else self._capture_grab(widget, target)
            if ok:
                used = backend
                break
        if used is None:
            raise CaptureError(f'all capture backends failed for {target}')
        self.last_backend = used

        image = QImage(target)
        if image.isNull():
            raise CaptureError(f'captured image unreadable: {target}')
        crop_box = None
        if crop is not None and crop.width() > 0 and crop.height() > 0:
            box = self.scaled(crop, self.dpr(widget))
            box = box.intersected(QRect(0, 0, image.width(), image.height()))
            if box.width() <= 0 or box.height() <= 0:
                raise CaptureError(f'crop {crop} is outside the capture {image.size()}')
            image = image.copy(box)
            if not image.save(target, 'PNG'):
                raise CaptureError(f'failed to write cropped capture {target}')
            crop_box = [box.x(), box.y(), box.width(), box.height()]
        return {
            'backend': used,
            'file': target,
            'size': [image.width(), image.height()],
            'crop': crop_box,
        }

    @staticmethod
    def distinct_colors(image_path, rect=None, step=4) -> int:
        """Distinct 8-bit RGB values in `rect` (image pixels), sampled every
        `step` pixels. The flat-block detector for the capture probe."""
        image = QImage(image_path)
        if image.isNull():
            return 0
        area = QRect(0, 0, image.width(), image.height()) if rect is None else rect
        area = area.intersected(QRect(0, 0, image.width(), image.height()))
        seen = set()
        for y in range(area.top(), area.bottom() + 1, step):
            for x in range(area.left(), area.right() + 1, step):
                seen.add(image.pixel(x, y) & 0x00FFFFFF)
        return len(seen)
