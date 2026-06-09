import tkinter as tk
from tkinter import filedialog, messagebox
from tkinter import ttk

import numpy as np
import rasterio
from pyproj import CRS, Geod, Transformer

import matplotlib
matplotlib.use("TkAgg")
from matplotlib.figure import Figure
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg, NavigationToolbar2Tk


def fmt(value, digits=3):
    if value is None:
        return "N/A"
    if isinstance(value, (int, float, np.floating)):
        return f"{value:.{digits}f}"
    return str(value)


def read_elevation_stats(src):
    """
    Returns min/max from first band while ignoring nodata.
    """
    band = src.read(1, masked=True)

    if np.ma.isMaskedArray(band):
        values = band.compressed()
    else:
        values = band.ravel()

    values = values[np.isfinite(values)]
    if values.size == 0:
        return None, None

    return float(np.min(values)), float(np.max(values))


def compute_metrics(tif_path):
    with rasterio.open(tif_path) as src:
        bounds = src.bounds
        width_px = src.width
        height_px = src.height

        rio_crs = src.crs
        crs = CRS.from_user_input(rio_crs) if rio_crs else None

        left, bottom, right, top = bounds.left, bounds.bottom, bounds.right, bounds.top
        center_x = (left + right) / 2.0
        center_y = (bottom + top) / 2.0

        min_elev, max_elev = read_elevation_stats(src)

        # Default values
        x_length_m = None
        y_length_m = None
        footprint_area_m2 = None
        lon_center = None
        lat_center = None
        preview_extent = (left, right, bottom, top)
        axis_units = "m"

        if crs is not None and crs.is_geographic:
            # Geographic CRS: bounds are in degrees, convert distances to meters
            geod = Geod(ellps="WGS84")

            mid_lat = (bottom + top) / 2.0
            mid_lon = (left + right) / 2.0

            # Width across center latitude
            _, _, x_length_m = geod.inv(left, mid_lat, right, mid_lat)

            # Height across center longitude
            _, _, y_length_m = geod.inv(mid_lon, bottom, mid_lon, top)

            # Footprint area in m² from polygon area
            lon = [left, right, right, left, left]
            lat = [bottom, bottom, top, top, bottom]
            poly_area_m2, _ = geod.polygon_area_perimeter(lon, lat)
            footprint_area_m2 = abs(poly_area_m2)

            lon_center = center_x
            lat_center = center_y
            axis_units = "degrees"

        elif crs is not None:
            # Projected CRS: convert to meters using CRS unit factor
            unit_factor = 1.0
            unit_name = "metre"

            try:
                if crs.axis_info and len(crs.axis_info) > 0:
                    unit_factor = crs.axis_info[0].unit_conversion_factor
                    unit_name = crs.axis_info[0].unit_name
            except Exception:
                pass

            x_length_m = abs(right - left) * unit_factor
            y_length_m = abs(top - bottom) * unit_factor
            footprint_area_m2 = x_length_m * y_length_m

            # Transform center to WGS84 for lat/lon display
            transformer = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
            lon_center, lat_center = transformer.transform(center_x, center_y)

            axis_units = "m" if "met" in unit_name.lower() else f"converted from {unit_name}"

        else:
            # No CRS: we can still report raster extent in raw units, but not true lat/lon.
            x_length_m = abs(right - left)
            y_length_m = abs(top - bottom)
            footprint_area_m2 = x_length_m * y_length_m
            lon_center = None
            lat_center = None
            axis_units = "unknown"

        # Build a downsampled preview for display
        preview = src.read(
            1,
            out_shape=(min(256, src.height), min(256, src.width)),
            masked=True
        )

        if np.ma.isMaskedArray(preview):
            preview_data = preview.astype(np.float32).filled(np.nan)
        else:
            preview_data = preview.astype(np.float32)

        # Preview extent should still reflect the map bounds
        preview_extent = (left, right, bottom, top)

        return {
            "file_name": tif_path.split("\\")[-1].split("/")[-1],
            "crs": str(rio_crs) if rio_crs else "No CRS found",
            "width_px": width_px,
            "height_px": height_px,
            "left": left,
            "right": right,
            "bottom": bottom,
            "top": top,
            "x_length_m": x_length_m,
            "y_length_m": y_length_m,
            "footprint_area_m2": footprint_area_m2,
            "center_x": center_x,
            "center_y": center_y,
            "lon_center": lon_center,
            "lat_center": lat_center,
            "min_elev": min_elev,
            "max_elev": max_elev,
            "preview_data": preview_data,
            "preview_extent": preview_extent,
            "is_geographic": bool(crs.is_geographic) if crs else False,
            "axis_units": axis_units,
        }


class TerrainPopup:
    def __init__(self, info):
        self.info = info
        self.root = tk.Tk()
        self.root.title("Terrain TIFF Info")
        self.root.geometry("1100x700")
        self.root.minsize(900, 600)

        self.main = ttk.Frame(self.root, padding=10)
        self.main.pack(fill="both", expand=True)

        self.main.columnconfigure(0, weight=1)
        self.main.columnconfigure(1, weight=1)
        self.main.rowconfigure(0, weight=1)

        self.left_panel = ttk.Frame(self.main)
        self.left_panel.grid(row=0, column=0, sticky="nsew", padx=(0, 8))

        self.right_panel = ttk.Frame(self.main)
        self.right_panel.grid(row=0, column=1, sticky="nsew", padx=(8, 0))

        self._build_info_panel()
        self._build_plot_panel()

    def _build_info_panel(self):
        title = ttk.Label(self.left_panel, text="Terrain Information", font=("Segoe UI", 16, "bold"))
        title.pack(anchor="w", pady=(0, 8))

        text_frame = ttk.Frame(self.left_panel)
        text_frame.pack(fill="both", expand=True)

        self.text = tk.Text(text_frame, wrap="word", font=("Consolas", 11))
        scrollbar = ttk.Scrollbar(text_frame, orient="vertical", command=self.text.yview)
        self.text.configure(yscrollcommand=scrollbar.set)

        self.text.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        lines = []
        lines.append(f"File: {self.info['file_name']}")
        lines.append(f"CRS: {self.info['crs']}")
        lines.append(f"Raster size: {self.info['width_px']} px × {self.info['height_px']} px")
        lines.append("")
        lines.append("Extent:")
        lines.append(f"  Left:   {fmt(self.info['left'], 6)}")
        lines.append(f"  Right:  {fmt(self.info['right'], 6)}")
        lines.append(f"  Bottom: {fmt(self.info['bottom'], 6)}")
        lines.append(f"  Top:    {fmt(self.info['top'], 6)}")
        lines.append("")
        lines.append("SI dimensions:")
        lines.append(f"  X length: {fmt(self.info['x_length_m'], 3)} m")
        lines.append(f"  Y length: {fmt(self.info['y_length_m'], 3)} m")
        lines.append(f"  Footprint area: {fmt(self.info['footprint_area_m2'], 3)} m²")
        lines.append("")
        lines.append("Center:")
        if self.info["lon_center"] is not None and self.info["lat_center"] is not None:
            lon = self.info['lon_center']
            lat = self.info['lat_center']
            
            lon_dir = "E" if lon >= 0 else "W"
            lat_dir = "N" if lat >= 0 else "S"
            
            lines.append(f"  Longitude: {abs(lon):.6f}° {lon_dir}")
            lines.append(f"  Latitude : {abs(lat):.6f}° {lat_dir}")
        else:
            lines.append(f"  X: {fmt(self.info['center_x'], 6)}")
            lines.append(f"  Y: {fmt(self.info['center_y'], 6)}")
            lines.append("  No CRS available for lat/lon conversion")
        lines.append("")
        lines.append("Elevation:")
        lines.append(f"  Minimum elevation: {fmt(self.info['min_elev'], 3)} m")
        lines.append(f"  Maximum elevation: {fmt(self.info['max_elev'], 3)} m")
        lines.append("")
        lines.append("Note:")
        lines.append("  The preview is downsampled. The area shown is the raster footprint, not 3D surface area.")

        self.text.insert("1.0", "\n".join(lines))
        self.text.configure(state="disabled")

    def _build_plot_panel(self):
        title = ttk.Label(self.right_panel, text="Preview", font=("Segoe UI", 16, "bold"))
        title.pack(anchor="w", pady=(0, 8))

        self.fig = Figure(figsize=(5.2, 5.2), dpi=100)
        self.ax = self.fig.add_subplot(111)

        data = self.info["preview_data"]
        extent = self.info["preview_extent"]

        self.im = self.ax.imshow(
            data,
            cmap="terrain",
            origin="upper",
            extent=extent,
            interpolation="nearest"
        )

        self.ax.set_title("Low-resolution terrain preview")
        self.ax.set_xlabel("X (m)" if not self.info["is_geographic"] else "Longitude (°)")
        self.ax.set_ylabel("Y (m)" if not self.info["is_geographic"] else "Latitude (°)")

        self.click_text = self.ax.text(
            0.02, 0.98,
            "Click on the map",
            transform=self.ax.transAxes,
            va="top",
            ha="left",
            fontsize=9,
            bbox=dict(boxstyle="round", facecolor="white", alpha=0.8)
        )

        self.canvas = FigureCanvasTkAgg(self.fig, master=self.right_panel)
        self.canvas.draw()
        self.canvas.get_tk_widget().pack(fill="both", expand=True)

        toolbar_frame = ttk.Frame(self.right_panel)
        toolbar_frame.pack(fill="x")
        self.toolbar = NavigationToolbar2Tk(self.canvas, toolbar_frame)
        self.toolbar.update()

        self.status = ttk.Label(
            self.right_panel,
            text="Click inside the preview to read coordinates.",
            font=("Segoe UI", 10)
        )
        self.status.pack(anchor="w", pady=(8, 0))

        self.marker = None
        self.canvas.mpl_connect("button_press_event", self.on_click)

    def on_click(self, event):
        if event.inaxes != self.ax or event.xdata is None or event.ydata is None:
            return

        x = event.xdata
        y = event.ydata

        if self.marker is not None:
            self.marker.remove()

        self.marker = self.ax.plot(x, y, "ro", markersize=6)[0]

        if self.info["is_geographic"]:
            msg = f"Clicked: lon = {x:.6f}°, lat = {y:.6f}°"
        else:
            msg = f"Clicked: x = {x:.3f} m, y = {y:.3f} m"

        self.click_text.set_text(msg)
        self.status.configure(text=msg)
        self.canvas.draw_idle()

    def run(self):
        self.root.mainloop()


def main():
    root = tk.Tk()
    root.withdraw()

    tif_path = filedialog.askopenfilename(
        title="Select a TIFF file",
        filetypes=[("TIFF files", "*.tif *.tiff"), ("All files", "*.*")]
    )

    if not tif_path:
        messagebox.showinfo("Cancelled", "No file selected.")
        return

    try:
        info = compute_metrics(tif_path)
        app = TerrainPopup(info)
        app.run()
    except Exception as e:
        messagebox.showerror("Error", f"Could not read the TIFF file:\n\n{e}")


if __name__ == "__main__":
    main()