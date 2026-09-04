#!/usr/bin/env python3
"""Derives the panel's logo and favicons from the one source artwork.

    python3 scripts/build-icons.py

Run it again after replacing brand/logo.png; everything it writes under public/
is generated, and hand-editing any of it will be silently undone.

WHY THE SOURCE LIVES IN brand/ RATHER THAN AT THE MONOREPO ROOT

The student portal's copy of this script reads ../logo.png — the monorepo root —
which works only from inside the monorepo. This repository is one of the four
replacing it, so it carries its own copy of the artwork and depends on nothing
above its own root. The two files are byte-identical today; if the mark is ever
redrawn, both need the new one.

WHY THE CROPS ARE MEASURED HERE RATHER THAN WRITTEN DOWN

The portal's script hardcodes them, and they are wrong for this artwork: its
tree box starts 115px right of the canopy's actual left edge, and its lockup box
cuts the wordmark down to "ndic-a" at both ends. Numbers measured once, pasted
into a file and then trusted for a year are exactly the failure this avoids — so
the bands below are found in the alpha channel on every run, and printed, so
that redrawing the mark shows up as different numbers rather than as a silently
clipped logo. `bands()` explains what it looks for.

THE SOURCE

logo.png is 1536x1024 with a genuinely transparent background — not black, which
is what it looks like. The mark can therefore be composited onto whatever ground
each context needs, which matters here because the panel ships a light theme and
a dark one and the same PNG is used in both.

Three things stack in it: the circuit-board canopy and its trunk, the "Indic-ai"
wordmark below it, and a "Foundation for social good" tagline below that. The
tagline is measured and then discarded; see the note in `bands`.

WHY NOT 192/512/MASKABLE

The portal ships those because it is an installable PWA. This panel is not: it
has no manifest, and `robots: noindex, nofollow` in index.html says why — an
operations console holding applicant data is not something to add to a home
screen. The set below is exactly what index.html references, and no more.
"""

import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SOURCE = os.path.join(ROOT, 'brand', 'logo.png')
OUT = os.path.join(ROOT, 'public')

# What counts as ink.
#
# The mark is a glow, so its alpha falls away gradually and a bbox of "any
# non-zero pixel" runs 200px wider than anything visible. This threshold is
# ~3%: below the eye, above the falloff. Every band below is stable between
# thresholds of 8 and 128, which is the check that it is not a knife edge.
INK = 8

# Breathing room around a measured band, in source pixels.
#
# Cropping at exactly INK would slice the glow's outer falloff into a hard line.
BLEED = 8

# The ground the favicon sits on.
#
# A glow needs something to glow against: dropped onto the white a browser
# composites a transparent favicon over, the soft outer falloff disappears and
# the tree loses the halo that is most of its shape. This is the same family as
# the panel's own dark surface rather than pure black, so the icon does not read
# as a hole punched in a dark tab strip.
GROUND = (11, 14, 20, 255)


def load():
    im = Image.open(SOURCE).convert('RGBA')
    if im.size != (1536, 1024):
        raise SystemExit(f'source is {im.size}, expected (1536, 1024)')
    return im


def bands(im):
    """Finds the tree and the tree-plus-wordmark lockup in the artwork.

    Two measurements, each using a different property of the drawing:

    The tagline is separated from the wordmark by a band of blank rows, so it is
    found as a gap in the row profile and everything below the last gap is
    dropped. It is dropped because it is set at #d3d3d3 — about 1.6:1 against
    the light theme's card, invisible rather than subtle, and far under the
    4.5:1 this panel holds itself to. It is also text baked into a raster: it
    will not resize for an operator running their browser at 200%, cannot be
    selected, and is not read aloud. Those words are set as real text under the
    mark on the sign-in card instead, legible in both themes.

    The canopy and the wordmark have no gap between them — the trunk runs from
    one into the other — so the split is the narrowest row in the join, which is
    the trunk on its own. Returns (tree, lockup) as crop boxes.
    """
    a = im.getchannel('A')
    w, h = im.size
    px = a.load()

    # Sampled every 4th column: 4x cheaper, and no feature here is 4px wide.
    profile = [sum(1 for x in range(0, w, 4) if px[x, y] > INK) for y in range(h)]

    inked = [y for y, n in enumerate(profile) if n]
    gaps = [y for y in range(inked[0], inked[-1]) if not profile[y]]
    if not gaps:
        raise SystemExit('no blank row between wordmark and tagline — has the '
                         'artwork been redrawn as one solid block?')
    lockup_bottom = gaps[0]

    # The trunk, and so the boundary: the thinnest row in the lower half of the
    # lockup, searched from 55% down so the canopy's own gaps cannot win.
    lo = int(lockup_bottom * 0.55)
    split = min(range(lo, lockup_bottom), key=lambda y: profile[y])

    def box(y0, y1):
        band = a.crop((0, y0, w, y1)).point(lambda v: 255 if v > INK else 0)
        left, top, right, bottom = band.getbbox()
        return (max(0, left - BLEED), max(0, y0 + top - BLEED),
                min(w, right + BLEED), min(h, y0 + bottom + BLEED))

    return box(0, split), box(0, lockup_bottom)


def square(mark, side, occupancy, ground=GROUND):
    """Centres a mark on a square ground, scaled to fill `occupancy` of it.

    Occupancy is of the longest edge, so a wide mark and a tall one end up
    optically the same weight rather than mathematically the same area.
    """
    canvas = Image.new('RGBA', (side, side), ground)

    target = int(side * occupancy)
    scale = target / max(mark.size)
    resized = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))),
        Image.LANCZOS)

    canvas.alpha_composite(
        resized,
        ((side - resized.width) // 2, (side - resized.height) // 2))
    return canvas


def transparent(mark, width, colours=None):
    """The mark alone, scaled to a width, background left transparent.

    `colours` quantises to an adaptive palette. The mark is a smooth gradient,
    which is the worst case for that — but at 128 colours the banding is below
    the noise floor at these display sizes, and it takes a third off two files
    that load on the sign-in screen before an operator is authenticated.
    """
    scale = width / mark.width
    out = mark.resize((width, max(1, round(mark.height * scale))), Image.LANCZOS)
    if colours:
        out = out.quantize(colors=colours, method=Image.FASTOCTREE,
                           dither=Image.Dither.NONE).convert('RGBA')
    return out


def main():
    im = load()
    tree_box, lockup_box = bands(im)
    print(f'  measured  tree   {tree_box}')
    print(f'  measured  lockup {lockup_box}')

    tree = im.crop(tree_box)
    lockup = im.crop(lockup_box)

    written = []

    def save(img, name, **kw):
        path = os.path.join(OUT, name)
        img.save(path, **kw)
        written.append((name, os.path.getsize(path)))

    # --- the mark in the panel -----------------------------------------------
    #
    # Transparent, because both sit on the panel's own surface — white in one
    # theme and near-black in the other, and the glow works on both.
    #
    # Each is roughly twice its display width: 1.4rem for the rail's mark and
    # 150px for the sign-in lockup. That covers a 2x screen without paying for
    # a 4x one nobody has. Both are quantised; see `transparent`.
    save(transparent(tree, 64, colours=128), 'logo-mark.png', optimize=True)
    save(transparent(lockup, 300, colours=128), 'logo-full.png', optimize=True)

    # --- favicons ------------------------------------------------------------
    #
    # 0.82 of the tile. Tight enough that the tree is still legible at 32px,
    # loose enough that the glow is not cropped into a hard edge.
    #
    # Quantised above 64px only: at 16 and 32 the palette is already tiny and
    # quantising costs more in banding than it saves in bytes.
    for side in (16, 32, 180):
        name = 'apple-touch-icon.png' if side == 180 else f'icon-{side}.png'
        icon = square(tree, side, 0.82)
        if side > 64:
            icon = icon.quantize(colors=128, method=Image.FASTOCTREE,
                                 dither=Image.Dither.NONE).convert('RGBA')
        save(icon, name, optimize=True)

    # Still worth shipping beside the PNG links: a browser that ignores them
    # falls back to /favicon.ico by convention whether or not it is declared.
    ico = square(tree, 64, 0.82)
    ico.save(os.path.join(OUT, 'favicon.ico'),
             sizes=[(16, 16), (32, 32), (48, 48)])
    written.append(('favicon.ico', os.path.getsize(os.path.join(OUT, 'favicon.ico'))))

    total = sum(size for _, size in written)
    for name, size in written:
        print(f'  {name:24} {size / 1024:6.1f} kB')
    print(f'  {"":24} {total / 1024:6.1f} kB total')


if __name__ == '__main__':
    main()
