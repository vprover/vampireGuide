#!/usr/bin/env python3
"""
Utility script to convert lecture PDFs into MDX docs and copy related assets.

The workflow relies on `pdftotext` to extract slide text. For each lecture we
keep only the final variant of slides that use beamer overlays (identified by
identical consecutive headings), format the slide content into Markdown, and
store the result in `docs/lectures`.

Images from the original LaTeX folders are copied into `static/img/lectures/<Ln>`.
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List
import shutil

ROOT = Path(__file__).resolve().parents[1]
LECTURE_SRC_ROOT = ROOT / "docs" / "Lectures"
OUTPUT_DIR = ROOT / "docs" / "lectures"
STATIC_ROOT = ROOT / "static" / "img" / "lectures"

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg"}


@dataclass
class Slide:
    title: str
    lines: List[str]

    def content_key(self) -> str:
        return "\n".join(line.strip() for line in self.lines if line.strip())


def run_pdftotext(pdf_path: Path) -> str:
    result = subprocess.run(
        ["pdftotext", str(pdf_path), "-"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


def parse_slides(raw_text: str) -> List[Slide]:
    pages = []
    for page in raw_text.split("\f"):
        stripped_page = page.strip()
        if not stripped_page:
            continue
        lines = [line.rstrip() for line in stripped_page.splitlines()]
        # skip pages without meaningful text
        meaningful = [ln for ln in lines if ln.strip()]
        if not meaningful:
            continue
        title = meaningful[0].strip()
        # collect remaining lines as content
        content_lines = lines[lines.index(meaningful[0]) + 1 :]
        pages.append(Slide(title=title, lines=content_lines))
    return merge_overlays(pages)


def merge_overlays(slides: List[Slide]) -> List[Slide]:
    merged: List[Slide] = []
    i = 0
    while i < len(slides):
        current = slides[i]
        best = current
        j = i + 1
        while j < len(slides) and slides[j].title == current.title:
            candidate = slides[j]
            if len(candidate.content_key()) >= len(best.content_key()):
                best = candidate
            j += 1
        merged.append(best)
        i = j
    return merged


def is_code_line(line: str) -> bool:
    stripped = line.lstrip()
    if not stripped:
        return False
    return (
        stripped.startswith("%")
        or stripped.startswith("!")
        or stripped.startswith("?")
        or stripped.startswith("include(")
        or "fof(" in stripped
        or "cnf(" in stripped
        or stripped.startswith("run ")
    )


def normalise_bullet(text: str) -> str:
    text = text.lstrip("▶•↭").strip()
    if text.lower().startswith("- "):
        text = text[2:].strip()
    return text


def format_slide(slide: Slide) -> List[str]:
    if slide.title.lower() == "outline":
        items = []
        for raw_line in slide.lines:
            stripped = raw_line.strip()
            if stripped:
                items.append(f"- {stripped}")
        return items

    md_lines: List[str] = []
    paragraph: List[str] = []
    code_buffer: List[str] = []
    in_code = False

    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            merged = " ".join(paragraph)
            merged = re.sub(r"\s+", " ", merged)
            md_lines.append(merged.strip())
            paragraph = []

    def flush_code():
        nonlocal code_buffer, in_code
        if code_buffer:
            md_lines.append("```tptp")
            md_lines.extend(code_buffer)
            md_lines.append("```")
            code_buffer = []
        in_code = False

    for raw_line in slide.lines:
        line = raw_line.rstrip()
        if not line.strip():
            if in_code:
                code_buffer.append("")
            else:
                flush_paragraph()
            continue

        stripped = line.strip()

        if stripped.startswith(("▶", "•", "↭")):
            flush_code()
            flush_paragraph()
            bullet_text = normalise_bullet(stripped)
            if bullet_text:
                md_lines.append(f"- {bullet_text}")
            continue

        if is_code_line(line):
            flush_paragraph()
            if not in_code:
                in_code = True
                code_buffer = []
            code_buffer.append(line.strip())
            continue

        if in_code and re.fullmatch(r"[A-Za-z0-9_\[\]\(\)\s\:\=\.\,\-\+\>\<\!\?\&\|\%/]+", stripped):
            code_buffer.append(stripped)
            continue

        flush_code()
        if md_lines and md_lines[-1].startswith("- "):
            md_lines[-1] = f"{md_lines[-1]} {stripped}"
            continue
        paragraph.append(stripped)

    flush_paragraph()
    flush_code()
    return [ln for ln in md_lines if ln.strip()]


def copy_images(lecture_dir: Path, target_dir: Path) -> List[str]:
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    copied: List[str] = []
    for path in sorted(lecture_dir.iterdir()):
        if path.suffix.lower() in IMAGE_EXTENSIONS:
            stem_lower = path.stem.lower()
            if re.match(r"l\d+", stem_lower):
                # Skip temporary assets produced by TeX to HTML conversions.
                continue
            dest = target_dir / path.name
            shutil.copy2(path, dest)
            copied.append(path.name)
    return copied


def escape_problematic_sequences(text: str) -> str:
    def replace_non_image(match: re.Match[str]) -> str:
        label = match.group(1)
        return f"\\![{label}]"

    text = re.sub(r"!\[([^\]]+)\](?!\()", replace_non_image, text)
    text = escape_angle_brackets(text)
    text = escape_curly_braces(text)
    return text


def escape_angle_brackets(text: str) -> str:
    lines = []
    in_code_block = False
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            lines.append(line)
            continue
        if not in_code_block:
            line = line.replace("<=", "&lt;=").replace(">=", "&gt;=")
            line = line.replace("<>", "&lt;&gt;")
            line = line.replace("<", "&lt;").replace(">", "&gt;")
        lines.append(line)
    return "\n".join(lines)


def escape_curly_braces(text: str) -> str:
    lines = []
    in_code_block = False
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            lines.append(line)
            continue
        if not in_code_block:
            line = line.replace("{", "&#123;").replace("}", "&#125;")
        lines.append(line)
    return "\n".join(lines)


def convert_lecture(lecture_dir: Path) -> None:
    lecture_id = lecture_dir.name
    pdf_path = lecture_dir / f"{lecture_id}.pdf"

    if not pdf_path.exists():
        raise FileNotFoundError(f"Missing PDF for {lecture_id}: {pdf_path}")

    raw_text = run_pdftotext(pdf_path)
    slides = parse_slides(raw_text)
    if not slides:
        raise RuntimeError(f"No slides parsed for {lecture_id}")

    output_lines: List[str] = []
    lecture_number = lecture_id.lstrip("L")
    title_slide = slides[0]
    doc_title = f"Lecture {lecture_number}: {title_slide.title}"

    def yaml_quote(value: str) -> str:
        escaped = value.replace('"', '\\"')
        return f'"{escaped}"'

    output_lines.append("---")
    output_lines.append(f"id: {lecture_id.lower()}")
    output_lines.append(f"title: {yaml_quote(doc_title)}")
    output_lines.append(f"sidebar_label: Lecture {lecture_number}")
    output_lines.append("---\n")

    output_lines.append(f"## {title_slide.title}")
    intro_lines = format_slide(title_slide)
    if intro_lines:
        output_lines.extend(intro_lines)

    for slide in slides[1:]:
        output_lines.append("")
        output_lines.append(f"## {slide.title}")
        slide_lines = format_slide(slide)
        if slide_lines:
            output_lines.extend(slide_lines)

    images = copy_images(lecture_dir, STATIC_ROOT / lecture_id)
    if images:
        output_lines.append("")
        output_lines.append("## Lecture Images")
        for img in images:
            alt = Path(img).stem.replace("_", " ").replace("-", " ").title()
            output_lines.append(f"![{alt}](/img/lectures/{lecture_id}/{img})")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"{lecture_id}.mdx"
    final_text = "\n".join(output_lines).strip()
    final_text = escape_problematic_sequences(final_text)
    output_content = final_text + "\n"
    output_path.write_text(output_content, encoding="utf-8")


def main() -> None:
    if not LECTURE_SRC_ROOT.exists():
        raise SystemExit(f"Source folder {LECTURE_SRC_ROOT} not found.")

    for lecture_dir in sorted(LECTURE_SRC_ROOT.glob("L*")):
        if lecture_dir.is_dir():
            convert_lecture(lecture_dir)


if __name__ == "__main__":
    main()
