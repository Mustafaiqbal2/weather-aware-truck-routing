"""The weather heatmap's grid.

The grid is regular in Web Mercator, the projection the map is drawn in, so one grid
cell is exactly one pixel of the image the browser stretches over the map. A grid in
plain latitude/longitude would drift north-south against the roads on long trips.

Only cells within ``buffer_m`` of a route (true ground distance) are kept, which keeps
weather requests proportional to the corridor rather than its bounding box.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import shapely
from pyproj import Transformer

from .route_select import local_projection, to_line

Coord = tuple[float, float]  # (lat, lon)

MERCATOR = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
MERCATOR_INV = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)


@dataclass(frozen=True)
class Grid:
    west: float  # lon/lat of the image corners (cell edges, not centres)
    south: float
    east: float
    north: float
    cols: int
    rows: int
    cells: list[int]  # row-major indices (row 0 = north) of cells inside the corridor
    centers: list[Coord]  # (lat, lon) of each kept cell, same order as ``cells``
    distance_m: list[float]  # ground distance from each kept cell to the nearest route
    buffer_m: float


def build_grid(
    routes: Sequence[Sequence[Coord]], buffer_m: float = 80_000, target_cells: int = 240
) -> Grid:
    if not routes or any(len(r) < 2 for r in routes):
        raise ValueError("Need at least one route with two points")
    all_points = [p for r in routes for p in r]
    proj = local_projection(all_points)
    corridor = shapely.union_all([to_line(r, proj) for r in routes])

    xs, ys = MERCATOR.transform([p[1] for p in all_points], [p[0] for p in all_points])
    mid_lat = math.radians((min(p[0] for p in all_points) + max(p[0] for p in all_points)) / 2)
    pad = buffer_m / math.cos(mid_lat)  # mercator metres are stretched by 1/cos(lat)
    x0, x1 = min(xs) - pad, max(xs) + pad
    y0, y1 = min(ys) - pad, max(ys) + pad

    # Corridor area in mercator units, used to size the cells for the target count.
    approx_area = corridor.buffer(buffer_m).area / math.cos(mid_lat) ** 2
    cell = math.sqrt(approx_area / target_cells)
    for _ in range(4):
        grid = _grid(x0, x1, y0, y1, cell, corridor, proj, buffer_m)
        ratio = len(grid.cells) / target_cells
        if 0.8 <= ratio <= 1.2:
            break
        cell *= math.sqrt(ratio)
    return grid


def _grid(
    x0: float,
    x1: float,
    y0: float,
    y1: float,
    cell: float,
    corridor: shapely.Geometry,
    proj: Transformer,
    buffer_m: float,
) -> Grid:
    cols = max(2, math.ceil((x1 - x0) / cell))
    rows = max(2, math.ceil((y1 - y0) / cell))
    cx = x0 + (np.arange(cols) + 0.5) * cell
    cy = y0 + rows * cell - (np.arange(rows) + 0.5) * cell  # north to south
    mx, my = np.meshgrid(cx, cy)
    lon, lat = MERCATOR_INV.transform(mx.ravel(), my.ravel())
    px, py = proj.transform(lon, lat)
    dist = shapely.distance(shapely.points(px, py), corridor)
    keep = np.flatnonzero(dist <= buffer_m)

    west, north = MERCATOR_INV.transform(x0, y0 + rows * cell)
    east, south = MERCATOR_INV.transform(x0 + cols * cell, y0)
    return Grid(
        west=float(west),
        south=float(south),
        east=float(east),
        north=float(north),
        cols=cols,
        rows=rows,
        cells=[int(i) for i in keep],
        centers=[(float(lat[i]), float(lon[i])) for i in keep],
        distance_m=[float(dist[i]) for i in keep],
        buffer_m=buffer_m,
    )
