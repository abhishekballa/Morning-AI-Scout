"""Turn a Morning AI Scout .md file into a Word .docx file. No extra packages needed.

Usage:
    python tools/md_to_docx.py "Daily AI news/AI News 2026-11-10/AI News 2026-11-10.md"

The .docx is saved next to the .md file, with the same name.
"""
import re
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

FONT = "Nirmala UI"  # Windows font that includes Telugu letters

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
HYPERLINK = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"

INLINE = re.compile(
    r"\*\*\[(?P<blt>.+?)\]\((?P<blu>[^)\s]+)\)\*\*"  # **[text](url)**
    r"|\[(?P<lt>.+?)\]\((?P<lu>[^)\s]+)\)"            # [text](url)
    r"|\*\*(?P<b>.+?)\*\*"                             # **bold**
    r"|\*(?P<i>[^*\s][^*]*?)\*"                        # *italic*
    r"|(?P<url>https?://[^\s)]+)"                      # bare link
)


def rpr(bold=False, italic=False, link=False):
    props = ""
    if bold:
        props += "<w:b/><w:bCs/>"
    if italic:
        props += "<w:i/><w:iCs/>"
    if link:
        props += '<w:color w:val="0563C1"/><w:u w:val="single"/>'
    return f"<w:rPr>{props}</w:rPr>" if props else ""


def run(text, **kw):
    return f'<w:r>{rpr(**kw)}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def hyperlink(text, url, rels, bold=False):
    rid = f"rId{100 + len(rels)}"
    rels.append((rid, url))
    return f'<w:hyperlink r:id="{rid}">{run(text, bold=bold, link=True)}</w:hyperlink>'


def inline(text, rels):
    out, pos = [], 0
    for m in INLINE.finditer(text):
        if m.start() > pos:
            out.append(run(text[pos:m.start()]))
        if m.group("blt"):
            out.append(hyperlink(m.group("blt"), m.group("blu"), rels, bold=True))
        elif m.group("lt"):
            out.append(hyperlink(m.group("lt"), m.group("lu"), rels))
        elif m.group("b"):
            out.append(run(m.group("b"), bold=True))
        elif m.group("i"):
            out.append(run(m.group("i"), italic=True))
        else:
            out.append(hyperlink(m.group("url"), m.group("url"), rels))
        pos = m.end()
    if pos < len(text):
        out.append(run(text[pos:]))
    return "".join(out)


def para(content, style=None, left=None, quote=False):
    ppr = ""
    if style:
        ppr += f'<w:pStyle w:val="{style}"/>'
    if quote:
        ppr += ('<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="F4B400"/></w:pBdr>'
                '<w:shd w:val="clear" w:color="auto" w:fill="FFF8E1"/>')
    if left is not None:
        ppr += f'<w:ind w:left="{left}" w:hanging="360"/>'
    elif quote:
        ppr += '<w:ind w:left="240"/>'
    return f"<w:p><w:pPr>{ppr}</w:pPr>{content}</w:p>"


def list_item(marker, text, depth, rels):
    left = 720 + 360 * depth
    return para(run(marker) + "<w:r><w:tab/></w:r>" + inline(text, rels), left=left)


def body_xml(md_text, rels):
    parts = []
    for raw in md_text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.strip().startswith("```"):
            continue
        if line.startswith("### "):
            parts.append(para(inline(line[4:], rels), "Heading2"))
        elif line.startswith("## "):
            parts.append(para(inline(line[3:], rels), "Heading1"))
        elif line.startswith("# "):
            parts.append(para(inline(line[2:], rels), "Title"))
        elif line.startswith(">"):
            parts.append(para(inline(line.lstrip("> ").strip(), rels), quote=True))
        elif m := re.match(r"^(\s*)(\d+)\.\s+(.*)$", line):
            parts.append(list_item(f"{m.group(2)}.", m.group(3), len(m.group(1)) // 2, rels))
        elif m := re.match(r"^(\s*)[-*]\s+(.*)$", line):
            parts.append(list_item("•", m.group(2), len(m.group(1)) // 2, rels))
        else:
            parts.append(para(inline(line, rels)))
    return "".join(parts)


STYLES = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="{W_NS}">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:eastAsia="{FONT}" w:cs="{FONT}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-IN" w:bidi="te-IN"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="1F3864"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="1F4E79"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
</w:styles>"""

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""


def convert(md_path: Path) -> Path:
    rels = []
    body = body_xml(md_path.read_text(encoding="utf-8"), rels)
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document xmlns:w="{W_NS}" xmlns:r="{R_NS}"><w:body>{body}'
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>'
        "</w:sectPr></w:body></w:document>"
    )
    link_rels = "".join(
        f'<Relationship Id="{rid}" Type="{HYPERLINK}" Target="{escape(url, {chr(34): "&quot;"})}" TargetMode="External"/>'
        for rid, url in rels
    )
    doc_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        f"{link_rels}</Relationships>"
    )
    out = md_path.with_suffix(".docx")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", ROOT_RELS)
        z.writestr("word/document.xml", document)
        z.writestr("word/_rels/document.xml.rels", doc_rels)
        z.writestr("word/styles.xml", STYLES)
    return out


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit('Usage: python tools/md_to_docx.py "path/to/file.md"')
    src = Path(sys.argv[1])
    if not src.is_file():
        sys.exit(f"File not found: {src}")
    print(f"Saved: {convert(src)}")
