"""Renders the README's GIF and still, and the plugin's icon, from the frames
dump-frames.ts writes.

usage: python3 scripts/render-media.py <frames.json> <out-dir>
Needs Pillow, a monospace font (Menlo, DejaVu Sans Mono) and ffmpeg.
"""

import json
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

FONTS = [
    "/System/Library/Fonts/Menlo.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
]
CW, CH = 10, 20  # one terminal cell, in pixels
PAD = 18
BAR = 30
TERM_BG = 0x101016
DEFAULT_FG = 0xD6D6E0
DIM = 0x6C6C7C
ORANGE = 0xD77757
DEFAULT = 0x01000000
TICK_MS = 80
STOCK_FRAMES = 15  # the stock header alone, before the static starts under it
HEADER = 5  # a blank row, the stock header's three rows, a blank row

# Quadrant glyphs by mask: top-left 1, top-right 2, bottom-left 4, bottom-right 8.
QUADRANTS = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█"


def rgb(color):
    return ((color >> 16) & 255, (color >> 8) & 255, color & 255)


def mix(a, b, t):
    return tuple(round(x * (1 - t) + y * t) for x, y in zip(a, b))


def load_font():
    for path in FONTS:
        if os.path.exists(path):
            return ImageFont.truetype(path, 16)
    sys.exit("no monospace font found")


def cell(draw, font, x, y, glyph, fg, bg):
    """Draws one cell; block and line glyphs as shapes, so they tile."""
    fg = rgb(DEFAULT_FG if fg == DEFAULT else fg)
    bg = rgb(TERM_BG if bg == DEFAULT else bg)
    draw.rectangle([x, y, x + CW - 1, y + CH - 1], fill=bg)
    hw, hh = CW // 2, CH // 2
    if glyph == " ":
        return
    if glyph in QUADRANTS:
        mask = QUADRANTS.index(glyph)
        for bit, (qx, qy) in enumerate([(0, 0), (hw, 0), (0, hh), (hw, hh)]):
            if mask & (1 << bit):
                draw.rectangle([x + qx, y + qy, x + qx + hw - 1, y + qy + hh - 1], fill=fg)
    elif glyph in "░▒▓":
        shade = {"░": 0.3, "▒": 0.55, "▓": 0.8}[glyph]
        draw.rectangle([x, y, x + CW - 1, y + CH - 1], fill=mix(bg, fg, shade))
    elif glyph == "▎":
        draw.rectangle([x, y, x + 2, y + CH - 1], fill=fg)
    elif glyph == "│":
        draw.rectangle([x + hw - 1, y, x + hw, y + CH - 1], fill=fg)
    elif glyph == "╷":
        draw.rectangle([x + hw - 1, y + hh, x + hw, y + CH - 1], fill=fg)
    elif glyph in "━─":
        thick = 2 if glyph == "━" else 1
        draw.rectangle([x, y + hh - 1, x + CW - 1, y + hh - 2 + thick], fill=fg)
    elif glyph in "▰▱":
        points = [(x + 3, y + 5), (x + CW - 1, y + 5), (x + CW - 4, y + CH - 6), (x, y + CH - 6)]
        if glyph == "▰":
            draw.polygon(points, fill=fg)
        else:
            draw.polygon(points, outline=fg)
    elif glyph == "■":
        draw.rectangle([x + 1, y + 5, x + CW - 2, y + CH - 6], fill=fg)
    else:
        draw.text((x, y + 1), glyph, font=font, fill=fg)


def window(columns, rows):
    width = columns * CW + PAD * 2
    height = BAR + rows * CH + PAD * 2
    image = Image.new("RGB", (width, height), rgb(TERM_BG))
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 0, width, BAR], fill=(28, 28, 36))
    for i, color in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        cx = 18 + i * 20
        draw.ellipse([cx - 6, BAR // 2 - 6, cx + 6, BAR // 2 + 6], fill=color)
    return image, draw


def text_row(draw, font, row, column, text, color):
    for i, glyph in enumerate(text):
        cell(draw, font, PAD + (column + i) * CW, BAR + PAD + row * CH, glyph, color, DEFAULT)


def prompt(draw, font, top, columns):
    text_row(draw, font, top, 0, "─" * columns, DIM)
    text_row(draw, font, top + 1, 0, '❯ Try "refactor <filepath>"', DIM)
    text_row(draw, font, top + 2, 0, "─" * columns, DIM)
    text_row(draw, font, top + 3, 2, "? for shortcuts", DIM)


def header(draw, font, data):
    """The stock header, as Claude Code draws it; it stays above the banner."""
    logo = [" ▐▛███▜▌", "▝▜█████▛▘", "  ▘▘ ▝▝"]
    for row, line in enumerate(logo, start=1):
        text_row(draw, font, row, 0, line, ORANGE)
    text_row(draw, font, 1, 11, f"Claude Code v{data['version']}", DEFAULT_FG)
    text_row(draw, font, 2, 11, data["model"], DIM)
    text_row(draw, font, 3, 11, data["cwd"], DIM)


def screen(font, data, cells):
    columns, rows = data["columns"], data["rows"]
    image, draw = window(columns, HEADER + rows + 5)
    header(draw, font, data)
    if cells is not None:
        # The banner, in the row under the header.
        for i, (code, fg, bg) in enumerate(cells):
            row, column = divmod(i, columns)
            cell(draw, font, PAD + column * CW, BAR + PAD + (HEADER + row) * CH, chr(code), fg, bg)
    prompt(draw, font, HEADER + rows + 1, columns)
    return image


def icon(cells, columns, size=512):
    """The sprite alone, pixel for pixel, on the banner's night sky."""
    sky = (12, 10, 24)
    grid = 32
    art = Image.new("RGB", (grid, grid), sky)
    # The sprite's 24×18 pixels sit in columns 2–25 of the banner's first 9 rows.
    for row in range(9):
        for column in range(2, 26):
            code, fg, bg = cells[row * columns + column]
            if chr(code) != "▀":
                continue
            for half, color in ((0, fg), (1, bg)):
                if color not in (DEFAULT, 0x0C0A18):
                    art.putpixel((column - 2 + 4, row * 2 + half + 7), rgb(color))
    return art.resize((size, size), Image.NEAREST)


def main():
    source, out = sys.argv[1], sys.argv[2]
    data = json.load(open(source))
    font = load_font()
    os.makedirs(out, exist_ok=True)

    with tempfile.TemporaryDirectory() as work:
        sequence = [None] * STOCK_FRAMES + data["frames"]
        for n, cells in enumerate(sequence):
            screen(font, data, cells).save(os.path.join(work, f"f{n:04d}.png"))
        # The still: CyberClawd whole, between glitches.
        screen(font, data, data["frames"][-20]).save(os.path.join(out, "banner.png"), optimize=True)
        # The plugin's icon goes beside its manifest.
        manifest_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".claude-plugin")
        icon(data["frames"][-20], data["columns"]).save(os.path.join(manifest_dir, "icon.png"), optimize=True)
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-framerate", str(1000 / TICK_MS), "-i", os.path.join(work, "f%04d.png"),
                "-vf", "split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];"
                "[b][p]paletteuse=dither=none:diff_mode=rectangle",
                os.path.join(out, "cyber-clawd.gif"),
            ],
            check=True,
        )


if __name__ == "__main__":
    main()
