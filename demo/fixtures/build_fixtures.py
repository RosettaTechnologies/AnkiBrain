"""
Build the demo fixtures: two labelled figures and a minimal DOCX that carries
them, so the real document split (page text + figure extraction) has something
substantial to work with.

Run by demo/run.sh under the Anki venv python (needs PyQt6 for QPainter).
Writes into demo/out/fixtures/ (gitignored).

    build_fixtures.py OUT_DIR
"""

import os
import sys
import zipfile
from os import path

# QPainter needs a QGuiApplication for its font database; the figures are drawn
# into an in-memory image, so the offscreen platform is enough (and keeps the
# build free of a window on the demo desktop).
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')

from PyQt6.QtCore import QPoint, QRect, Qt
from PyQt6.QtGui import QColor, QFont, QGuiApplication, QImage, QPainter, QPen, QPolygon

WIDTH, HEIGHT = 900, 620


def new_image():
    image = QImage(WIDTH, HEIGHT, QImage.Format.Format_RGB32)
    image.fill(QColor('#f7f4ee'))
    return image


def draw_caption(painter, text, x, y):
    painter.setPen(QPen(QColor('#20242c')))
    font = QFont()
    font.setPointSize(11)
    painter.setFont(font)
    painter.drawText(QRect(x, y, 400, 40), Qt.AlignmentFlag.AlignLeft, text)


def draw_box(painter, x, y, w, h, label, fill):
    painter.setBrush(QColor(fill))
    painter.setPen(QPen(QColor('#2b3038'), 3))
    painter.drawRoundedRect(x, y, w, h, 12, 12)
    painter.setPen(QPen(QColor('#12151b')))
    font = QFont()
    font.setPointSize(13)
    font.setBold(True)
    painter.setFont(font)
    painter.drawText(QRect(x, y, w, h), Qt.AlignmentFlag.AlignCenter, label)


def draw_arrow(painter, x0, y0, x1, y1, label):
    painter.setPen(QPen(QColor('#8d3b2f'), 4))
    painter.setBrush(QColor('#8d3b2f'))
    painter.drawLine(QPoint(x0, y0), QPoint(x1, y1))
    painter.drawPolygon(QPolygon([
        QPoint(x1, y1),
        QPoint(x1 - 18, y1 - 10),
        QPoint(x1 - 18, y1 + 10),
    ]))
    painter.setPen(QPen(QColor('#8d3b2f')))
    font = QFont()
    font.setPointSize(10)
    painter.setFont(font)
    if label:
        painter.drawText(QRect(min(x0, x1), min(y0, y1) - 30, abs(x1 - x0) + 120, 26),
                         Qt.AlignmentFlag.AlignLeft, label)


def heart_figure(target):
    """Labelled boxes and arrows: the occlusion target."""
    image = new_image()
    painter = QPainter(image)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)

    font = QFont()
    font.setPointSize(18)
    font.setBold(True)
    painter.setFont(font)
    painter.setPen(QPen(QColor('#20242c')))
    painter.drawText(QRect(30, 20, 840, 40), Qt.AlignmentFlag.AlignLeft,
                     'Blood flow through the heart')

    draw_box(painter, 60, 110, 190, 90, 'Right atrium', '#cfe3f7')
    draw_box(painter, 60, 250, 190, 90, 'Right ventricle', '#bcd7f2')
    draw_box(painter, 620, 110, 210, 90, 'Left atrium', '#f6d3cf')
    draw_box(painter, 620, 250, 210, 90, 'Left ventricle', '#f0c0b8')

    draw_box(painter, 330, 110, 250, 70, 'Tricuspid valve', '#e6e2f4')
    draw_box(painter, 330, 250, 250, 70, 'Mitral valve', '#e6e2f4')
    draw_box(painter, 330, 400, 250, 70, 'Aortic valve', '#dfe8dc')
    draw_box(painter, 60, 400, 190, 70, 'Pulmonary artery', '#d7e8ef')
    draw_box(painter, 620, 400, 210, 70, 'Aorta', '#e8dcd0')

    draw_arrow(painter, 250, 155, 330, 145, '')
    draw_arrow(painter, 580, 145, 620, 155, 'to lungs')
    draw_arrow(painter, 250, 295, 330, 285, '')
    draw_arrow(painter, 580, 285, 620, 295, 'to body')

    draw_caption(painter, 'Figure 1. Four chambers, four valves, two circulations.',
                 60, 540)
    painter.end()
    image.save(target, 'PNG')


def chart_figure(target):
    """A bar chart: the second image, used for the hand-drawn masks."""
    image = new_image()
    painter = QPainter(image)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)

    font = QFont()
    font.setPointSize(18)
    font.setBold(True)
    painter.setFont(font)
    painter.setPen(QPen(QColor('#20242c')))
    painter.drawText(QRect(30, 20, 840, 40), Qt.AlignmentFlag.AlignLeft,
                     'Cardiac output at rest and at peak exercise')

    bars = [
        ('Rest', 5.0, 120),
        ('Walking', 8.0, 200),
        ('Running', 18.0, 380),
        ('Sprinting', 25.0, 500),
    ]
    painter.setPen(QPen(QColor('#2b3038'), 2))
    painter.drawLine(QPoint(140, 520), QPoint(840, 520))
    painter.drawLine(QPoint(140, 520), QPoint(140, 110))

    for index, (label, litres, height) in enumerate(bars):
        x = 190 + index * 165
        painter.setBrush(QColor('#7fa8d4') if index % 2 == 0 else QColor('#c98a76'))
        painter.setPen(QPen(QColor('#2b3038'), 2))
        painter.drawRect(x, 520 - height, 110, height)
        painter.setPen(QPen(QColor('#12151b')))
        font = QFont()
        font.setPointSize(12)
        painter.setFont(font)
        painter.drawText(QRect(x - 20, 525, 150, 30), Qt.AlignmentFlag.AlignCenter, label)
        painter.drawText(QRect(x - 20, 520 - height - 30, 150, 26),
                         Qt.AlignmentFlag.AlignCenter, f'{litres:g} L/min')

    draw_caption(painter, 'Figure 2. Cardiac output from rest to sprinting.',
                 190, 560)
    painter.end()
    image.save(target, 'PNG')


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""

DOC_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/figure-heart.png"/>
  <Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/figure-chart.png"/>
</Relationships>
"""

# Word's EMU geometry: a 900x620 image at 96 dpi is 8572500 x 5905500 EMU.
IMAGE_SIZE = (8572500, 5905500)


def drawing(rel_id, title):
    cx, cy = IMAGE_SIZE
    return f"""    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0"
                     xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
            <wp:extent cx="{cx}" cy="{cy}"/>
            <wp:docPr id="{rel_id[-1]}" name="{title}"/>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:nvPicPr>
                    <pic:cNvPr id="{rel_id[-1]}" name="{title}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="{rel_id}"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
"""


def paragraph(text, bold=False):
    run = f'<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{text}</w:t></w:r>' if bold \
        else f'<w:r><w:t xml:space="preserve">{text}</w:t></w:r>'
    return f'    <w:p>{run}</w:p>\n'


PARAGRAPHS = [
    ('Cardiovascular physiology — lecture handout', True),
    ('This handout summarises the haemodynamics of the cardiac cycle, the '
     'determinants of cardiac output, and the pressure-volume behaviour of the '
     'left ventricle. Each figure is labelled so that the structures can be '
     'identified at a glance.', False),
    ('The cardiac cycle is conventionally split into systole, when the '
     'ventricles contract and eject blood, and diastole, when they relax and '
     'refill. At rest the two phases are of similar duration; with exercise, '
     'diastole shortens more than systole.', False),
    ('Stroke volume is set by preload, afterload and contractility. Preload is '
     'the end-diastolic wall stress and is estimated clinically from the '
     'end-diastolic volume; afterload is the resistance the ventricle must '
     'overcome to eject, dominated by systemic vascular resistance.', False),
    ('Figure 1 shows the route of blood through the four chambers and the '
     'valves that keep flow unidirectional.', False),
    ('DRAWING_HEART', False),
    ('The Frank-Starling relationship expresses the observation that a larger '
     'end-diastolic volume produces a stronger contraction, up to the point '
     'where the sarcomeres are overstretched.', False),
    ('Cardiac output is the product of stroke volume and heart rate. Figure 2 '
     'shows how it scales from resting values to maximal exercise in a trained '
     'subject.', False),
    ('DRAWING_CHART', False),
    ('Pressures during the cycle follow the same sequence: atrial pressure '
     'rises during ventricular systole as the atrium fills against a closed '
     'tricuspid valve, and the ventricular pressure-volume loop traces filling, '
     'isovolumetric contraction, ejection and isovolumetric relaxation.', False),
]


def build_docx(target, media):
    body = []
    for text, bold in PARAGRAPHS:
        if text == 'DRAWING_HEART':
            body.append(drawing('rId10', 'Figure 1'))
        elif text == 'DRAWING_CHART':
            body.append(drawing('rId11', 'Figure 2'))
        else:
            body.append(paragraph(text, bold))
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:body>\n' + ''.join(body) + '  </w:body>\n</w:document>\n'
    )
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as package:
        package.writestr('[Content_Types].xml', CONTENT_TYPES)
        package.writestr('_rels/.rels', ROOT_RELS)
        package.writestr('word/document.xml', document)
        package.writestr('word/_rels/document.xml.rels', DOC_RELS)
        for name, source in media.items():
            with open(source, 'rb') as handle:
                package.writestr(f'word/media/{name}', handle.read())


def main(argv):
    out_dir = argv[1] if len(argv) > 1 else 'demo/out/fixtures'
    os.makedirs(out_dir, exist_ok=True)
    app = QGuiApplication.instance() or QGuiApplication([])
    heart = path.join(out_dir, 'figure-heart.png')
    chart = path.join(out_dir, 'figure-chart.png')
    heart_figure(heart)
    chart_figure(chart)
    docx = path.join(out_dir, 'figures.docx')
    build_docx(docx, {'figure-heart.png': heart, 'figure-chart.png': chart})
    for artifact in (heart, chart, docx):
        print(f'{artifact} ({os.path.getsize(artifact)} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
