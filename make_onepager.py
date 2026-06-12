"""One-page stakeholder PDF: Navara Strategy architecture + monthly cost."""

from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

NAVY = colors.HexColor("#1F3A5F")
ACCENT = colors.HexColor("#2E6FB7")
BOX_FILL = colors.HexColor("#EEF3F9")
LIGHT = colors.HexColor("#F5F7FA")
GREY = colors.HexColor("#5A6472")

styles = getSampleStyleSheet()
title_style = ParagraphStyle(
    "TitleX", parent=styles["Title"], fontSize=17, leading=20,
    textColor=NAVY, spaceAfter=2, alignment=0,
)
subtitle_style = ParagraphStyle(
    "SubtitleX", parent=styles["Normal"], fontSize=9, leading=12,
    textColor=GREY, spaceAfter=6,
)
h2 = ParagraphStyle(
    "H2X", parent=styles["Heading2"], fontSize=11.5, leading=14,
    textColor=NAVY, spaceBefore=10, spaceAfter=4,
)
body = ParagraphStyle(
    "BodyX", parent=styles["Normal"], fontSize=9.3, leading=12.5,
    textColor=colors.HexColor("#222222"),
)
small = ParagraphStyle(
    "SmallX", parent=styles["Normal"], fontSize=7.6, leading=9.5, textColor=GREY,
)
cell = ParagraphStyle("CellX", parent=body, fontSize=8.8, leading=11)
cell_b = ParagraphStyle("CellBX", parent=cell, fontName="Helvetica-Bold")


def box(d, x, y, w, h, lines, fill=BOX_FILL, stroke=NAVY, bold_first=True):
    d.add(Rect(x, y, w, h, fillColor=fill, strokeColor=stroke,
               strokeWidth=0.9, rx=4, ry=4))
    n = len(lines)
    line_h = 9.5
    top = y + h / 2 + (n - 1) * line_h / 2 - 3
    for i, text in enumerate(lines):
        font = "Helvetica-Bold" if (i == 0 and bold_first) else "Helvetica"
        d.add(String(x + w / 2, top - i * line_h, text,
                     fontName=font, fontSize=7.6, fillColor=NAVY,
                     textAnchor="middle"))


def arrow(d, x1, y1, x2, y2, label=None, label_dy=4):
    d.add(Line(x1, y1, x2, y2, strokeColor=ACCENT, strokeWidth=1.1))
    # arrowhead
    import math
    ang = math.atan2(y2 - y1, x2 - x1)
    size = 5
    pts = []
    for da in (math.radians(150), math.radians(-150)):
        pts.extend([x2 + size * math.cos(ang + da), y2 + size * math.sin(ang + da)])
    pts.extend([x2, y2])
    d.add(Polygon(pts, fillColor=ACCENT, strokeColor=ACCENT))
    if label:
        d.add(String((x1 + x2) / 2, (y1 + y2) / 2 + label_dy, label,
                     fontName="Helvetica-Oblique", fontSize=6.8,
                     fillColor=GREY, textAnchor="middle"))


def architecture_drawing():
    d = Drawing(532, 196)

    # Column 1 — clients
    box(d, 4, 142, 104, 36, ["Browser users", "(web portal)"])
    box(d, 4, 84, 104, 36, ["Partner SFTP", "clients"])

    # Column 2 — entry points
    box(d, 158, 142, 150, 36, ["Amazon CloudFront", "CDN + WebDAV edge fn"])
    box(d, 158, 84, 150, 36, ["AWS Transfer Family", "managed SFTP endpoint"],
        fill=colors.HexColor("#FDF1E3"), stroke=colors.HexColor("#B5722A"))
    box(d, 158, 18, 150, 36, ["Amazon Cognito", "sign-in, roles, MFA-ready"])

    # Column 3 — app + data
    box(d, 366, 142, 162, 36, ["Next.js web app", "AWS Lambda - scales to zero"])
    box(d, 366, 84, 162, 36, ["Amazon S3", "per-company file storage"])
    box(d, 366, 18, 162, 36, ["PostgreSQL (RDS)", "Excel import database"])

    # Flows
    arrow(d, 108, 160, 158, 160)                       # browser -> cloudfront
    arrow(d, 308, 160, 366, 160)                       # cloudfront -> app
    arrow(d, 108, 102, 158, 102)                       # sftp client -> transfer
    arrow(d, 308, 102, 366, 102)                       # transfer -> s3
    arrow(d, 447, 142, 447, 120)                       # app -> s3
    arrow(d, 447, 84, 447, 54)                         # s3 -> rds
    d.add(String(454, 66, "Excel imports", fontName="Helvetica-Oblique",
                 fontSize=6.8, fillColor=GREY, textAnchor="start"))
    arrow(d, 380, 142, 270, 54)                        # app -> cognito
    d.add(String(322, 72, "authentication", fontName="Helvetica-Oblique",
                 fontSize=6.8, fillColor=GREY, textAnchor="start"))
    arrow(d, 233, 84, 233, 54)                         # transfer -> cognito

    return d


def build():
    doc = SimpleDocTemplate(
        "navara-architecture-cost-onepager.pdf", pagesize=letter,
        leftMargin=40, rightMargin=40, topMargin=36, bottomMargin=32,
        title="Navara Strategy - Cloud Architecture & Cost Summary",
        author="Navara Strategy",
    )
    story = []

    story.append(Paragraph("Navara Strategy — Cloud Architecture &amp; Monthly Cost", title_style))
    story.append(Paragraph(
        "Stakeholder summary · AWS (us-east-1) · Prepared June 2026", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.2, color=NAVY, spaceAfter=6))

    story.append(Paragraph(
        "The platform runs on AWS and was recently re-evaluated against Azure, Google Cloud, and lighter "
        "hosting platforms. <b>AWS remains the most cost-effective option.</b> Roughly 90% of the monthly bill "
        "is the managed SFTP endpoint that external partners use to exchange files — that capability <i>is</i> the "
        "product, and no other provider offers it cheaper with the same per-company security isolation. "
        "Everything else is serverless: the web portal, file processing, and authentication scale to zero and "
        "cost almost nothing when idle.", body))

    story.append(Paragraph("Architecture at a glance", h2))
    story.append(architecture_drawing())

    story.append(Paragraph("Estimated monthly cost", h2))

    rows = [
        [Paragraph("<b>Component</b>", cell_b), Paragraph("<b>Monthly</b>", cell_b),
         Paragraph("<b>Notes</b>", cell_b)],
        [Paragraph("Managed SFTP endpoint (AWS Transfer Family)", cell),
         Paragraph("~$219", cell),
         Paragraph("Always-on; core partner file exchange. ~90% of the bill.", cell)],
        [Paragraph("PostgreSQL database (RDS, smallest tier + backups)", cell),
         Paragraph("~$16", cell),
         Paragraph("7-day automated backups and deletion protection enabled.", cell)],
        [Paragraph("Registry, secrets, logs", cell),
         Paragraph("~$4–6", cell),
         Paragraph("Container images, credentials vault, 30-day log retention.", cell)],
        [Paragraph("Web portal compute, CDN, sign-in", cell),
         Paragraph("~$0–5", cell),
         Paragraph("Serverless, scales to zero; mostly inside AWS free tiers.", cell)],
        [Paragraph("File storage &amp; transfer (usage-based)", cell),
         Paragraph("~$2–8", cell),
         Paragraph("S3 at $0.023/GB stored; SFTP transfer at $0.04/GB moved.", cell)],
        [Paragraph("<b>Typical month</b>", cell_b),
         Paragraph("<b>~$240–265</b>", cell_b),
         Paragraph("<b>Quiet month ≈ $240–245; active month ≈ $250–265.</b>", cell_b)],
    ]
    table = Table(rows, colWidths=[218, 62, 252])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#FDF1E3")),
        ("BACKGROUND", (0, -1), (-1, -1), LIGHT),
        ("ROWBACKGROUNDS", (0, 2), (-1, -2), [colors.white, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#C9D2DC")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    # White header text needs explicit paragraph color
    rows[0][0] = Paragraph('<font color="white"><b>Component</b></font>', cell_b)
    rows[0][1] = Paragraph('<font color="white"><b>Monthly</b></font>', cell_b)
    rows[0][2] = Paragraph('<font color="white"><b>Notes</b></font>', cell_b)
    story.append(table)

    story.append(Spacer(1, 8))
    takeaway = Table(
        [[Paragraph(
            "<b>What controls this cost:</b> the SFTP endpoint is the only significant line item. If partner "
            "SFTP usage ever winds down, removing it drops the bill to <b>~$25–40/month</b> — partners could "
            "still exchange files through the web portal against the same storage. All other optimizations "
            "combined are worth less than $5/month. A <b>$300/month budget guardrail</b> is in place with "
            "email alerts at 50/80/100% of actual and forecasted spend.", cell)]],
        colWidths=[532],
    )
    takeaway.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EAF1FA")),
        ("BOX", (0, 0), (-1, -1), 0.9, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(takeaway)

    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Estimates use AWS us-east-1 list pricing as of June 2026 and current usage assumptions; actuals are "
        "tracked in AWS Cost Explorer with per-component cost tags. Deployments are manual-only with an "
        "approval gate; all data is encrypted at rest and in transit.", small))

    doc.build(story)
    print("written: navara-architecture-cost-onepager.pdf")


if __name__ == "__main__":
    build()
