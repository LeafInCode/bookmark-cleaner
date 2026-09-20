import os
import struct
import zlib


def in_rounded_rect(x, y, w, h, r, px, py):
    if px < x or px >= x + w or py < y or py >= y + h:
        return False
    cx = min(max(px, x + r), x + w - r)
    cy = min(max(py, y + r), y + h - r)
    dx = px - cx
    dy = py - cy
    return dx * dx + dy * dy <= r * r


def in_bookmark(px, py, cx, top, bottom, half_w, notch):
    if py < top or py > bottom:
        return False
    if px < cx - half_w or px > cx + half_w:
        return False
    if py > bottom - notch:
        t = (py - (bottom - notch)) / notch
        limit = half_w * (1 - t)
        return abs(px - cx) <= limit
    return True


def render(size):
    ss = 4
    W = size * ss
    cx = W / 2
    img = []
    for y in range(size):
        row = []
        for x in range(size):
            r_sum = g_sum = b_sum = a_sum = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = x * ss + sx + 0.5
                    py = y * ss + sy + 0.5
                    r = g = b = a = 0
                    m = 0
                    rad = W * 0.22
                    if in_rounded_rect(m, m, W - 2 * m, W - 2 * m, rad, px, py):
                        r, g, b, a = 37, 99, 235, 255
                        half_w = W * 0.17
                        top = W * 0.22
                        bottom = W * 0.80
                        if in_bookmark(px, py, cx, top, bottom, half_w, W * 0.16):
                            r, g, b = 255, 255, 255
                    r_sum += r
                    g_sum += g
                    b_sum += b
                    a_sum += a
            n = ss * ss
            row.append((r_sum // n, g_sum // n, b_sum // n, a_sum // n))
        img.append(row)
    return img


def write_png(path, img):
    h = len(img)
    w = len(img[0])
    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in row) for row in img)

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        c += struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
        return c

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def write_png_rgb(path, img):
    h = len(img)
    w = len(img[0])
    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in row) for row in img)

    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        c += struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
        return c

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def render_store_icon(size):
    ss = 4
    W = size * ss
    cx = W / 2
    img = []
    for y in range(size):
        row = []
        for x in range(size):
            r_sum = g_sum = b_sum = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = x * ss + sx + 0.5
                    py = y * ss + sy + 0.5
                    r, g, b = 255, 255, 255
                    m = 0
                    rad = W * 0.22
                    if in_rounded_rect(m, m, W - 2 * m, W - 2 * m, rad, px, py):
                        r, g, b = 37, 99, 235
                        half_w = W * 0.17
                        top = W * 0.22
                        bottom = W * 0.80
                        if in_bookmark(px, py, cx, top, bottom, half_w, W * 0.16):
                            r, g, b = 255, 255, 255
                    r_sum += r
                    g_sum += g
                    b_sum += b
            n = ss * ss
            row.append((r_sum // n, g_sum // n, b_sum // n))
        img.append(row)
    return img


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(base, "icons")
    os.makedirs(out, exist_ok=True)
    for s in (16, 48, 128):
        write_png(os.path.join(out, f"icon{s}.png"), render(s))
        print(f"icons/icon{s}.png")
    store_dir = os.path.join(base, "store")
    os.makedirs(store_dir, exist_ok=True)
    write_png_rgb(os.path.join(store_dir, "store-icon-128.png"), render_store_icon(128))
    print("store/store-icon-128.png (128x128, RGB 无透明通道)")


if __name__ == "__main__":
    main()
