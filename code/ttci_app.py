import streamlit as st
import rasterio
import numpy as np
import folium
from folium import plugins
import branca
import branca.colormap as cm
import plotly.express as px
from streamlit_folium import st_folium
import os
import warnings

# Suppress runtime warnings from dividing by NaN in the raster
warnings.filterwarnings("ignore", category=RuntimeWarning)

# --- PAGE CONFIGURATION ---
st.set_page_config(page_title="Terrain Guard - UAS CFIT Pipeline", layout="wide")

st.title("Terrain Guard - TTCI Computation Pipeline")
st.markdown("Calculates an Aviation-Grade Terrain Topography Complexity Index (TTCI) optimized for UAS corridor risk assessment.")

col1, col2 = st.columns([1, 2])

# --- MATHEMATICAL PIPELINE (UAS CFIT Risk Model) ---
@st.cache_data
def calculate_ttci(dem_path):
    # Fixed standard aviation weights
    slope_weight = 0.70
    ruggedness_weight = 0.30

    with rasterio.open(dem_path) as src:
        dem_raw = src.read(1).astype(float)
        meta = src.meta

    # Filter out NoData holes
    dem = dem_raw.copy()
    dem[dem < -10000] = np.nan

    st.write("Calculating gradient climb-rate limits...")
    # 1. SLOPE RISK (Gradient Magnitude)
    dy, dx = np.gradient(dem)
    slope_magnitude = np.sqrt(dx**2 + dy**2)
    
    max_slope = np.nanpercentile(slope_magnitude, 95)
    if max_slope == 0: max_slope = 1
    slope_risk = np.clip((slope_magnitude / max_slope) * 100, 0, 100)

    st.write("Calculating altimeter variance (turbulence risk)...")
    # 2. RUGGEDNESS RISK (TRI)
    padded = np.pad(dem, 1, mode='edge')
    tri = np.zeros_like(dem, dtype=float)
    
    for i in [-1, 0, 1]:
        for j in [-1, 0, 1]:
            if i == 0 and j == 0: continue
            shifted = padded[1+i : 1+i+dem.shape[0], 1+j : 1+j+dem.shape[1]]
            tri += np.abs(dem - shifted)
            
    tri = tri / 8.0
    max_tri = np.nanpercentile(tri, 95)
    if max_tri == 0: max_tri = 1
    ruggedness_risk = np.clip((tri / max_tri) * 100, 0, 100)

    # 3. COMPOSITE TTCI (0-100 Scale)
    ttci_output = (slope_risk * slope_weight) + (ruggedness_risk * ruggedness_weight)
    ttci_output = np.clip(ttci_output, 0, 100)
    
    return ttci_output, dem_raw, slope_risk, ruggedness_risk, meta

# --- LEFT WINDOW: PIPELINE CONTROLS ---
with col1:
    st.header("1. Pipeline Input")
    uploaded_file = st.file_uploader("Upload Himalayan DEM (.tif)", type=['tif', 'tiff'])

    st.markdown("---")

    if uploaded_file is not None:
        if st.button("Calculate Aviation TTCI", type="primary"):
            
            temp_input_path = "temp_input_dem.tif"
            with open(temp_input_path, "wb") as f:
                f.write(uploaded_file.getbuffer())

            with st.spinner('Running UAS Risk Analysis Model...'):
                ttci_data, dem_raw, slope_risk, ruggedness_risk, meta = calculate_ttci(temp_input_path)
                
                output_filename = "Himalaya_UAS_Risk_Output.tif"
                meta.update(dtype=rasterio.float32, count=1, nodata=np.nan)
                
                with rasterio.open(output_filename, 'w', **meta) as dst:
                    dst.write(ttci_data.astype(rasterio.float32), 1)

                st.success(f"Pipeline Complete! Saved: `{output_filename}`")
                
                # Save all parameter layers to session state for JS injection
                st.session_state['ttci_data'] = ttci_data
                st.session_state['dem_raw'] = dem_raw
                st.session_state['slope_risk'] = slope_risk
                st.session_state['ruggedness_risk'] = ruggedness_risk
                
                st.session_state['max_tci'] = float(np.nanmax(ttci_data))
                st.session_state['avg_tci'] = float(np.nanmean(ttci_data))
                
            if os.path.exists(temp_input_path):
                os.remove(temp_input_path)

# --- RIGHT WINDOW: INTERACTIVE VISUAL DISPLAY ---
with col2:
    st.header("2. Interactive UAS Risk Map")
    
    if 'ttci_data' in st.session_state:
        metric_col1, metric_col2, metric_col3 = st.columns(3)
        with metric_col1:
            st.metric(label="Peak TTCI", value=f"{st.session_state['max_tci']:.1f}/100", help="Highest complexity score found in this sector.")
        with metric_col2:
            st.metric(label="Avg Area Risk", value=f"{st.session_state['avg_tci']:.1f}/100", help="Overall difficulty of navigating this terrain.")
        with metric_col3:
            critical_zone_pct = (np.nansum(st.session_state['ttci_data'] > 80) / np.count_nonzero(~np.isnan(st.session_state['ttci_data']))) * 100
            st.metric(label="Critical No-Fly Zones", value=f"{critical_zone_pct:.1f}%", delta="Fatal Risk Area", delta_color="inverse")

        st.markdown("---")
        
        flat_data = st.session_state['ttci_data'].flatten()
        flat_data = flat_data[~np.isnan(flat_data)]
        
        fig = px.histogram(
            flat_data, 
            nbins=50, 
            title="Terrain Risk Distribution in Selected Sector",
            labels={'value': 'TTCI Risk Score', 'count': 'Amount of Terrain (Pixels)'},
            color_discrete_sequence=['#ff4b4b']
        )
        fig.update_layout(height=250, margin=dict(l=10, r=10, t=30, b=10))
        fig.add_vrect(x0=0, x1=40, fillcolor="green", opacity=0.1, layer="below", line_width=0)
        fig.add_vrect(x0=80, x1=100, fillcolor="red", opacity=0.1, layer="below", line_width=0)
        st.plotly_chart(fig, use_container_width=True)

        st.markdown("---")

        with rasterio.open("Himalaya_UAS_Risk_Output.tif") as raster:
            bounds = raster.bounds
            center_lat = (bounds.bottom + bounds.top) / 2
            center_lon = (bounds.left + bounds.right) / 2
            
        m = folium.Map(location=[center_lat, center_lon], zoom_start=11, tiles="OpenStreetMap")
        
        folium.TileLayer(
            tiles='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            attr='Esri', name='Satellite Imagery', overlay=False, control=True
        ).add_to(m)

        def risk_colormap(x):
            if np.isnan(x): return (0, 0, 0, 0)
            if x > 80: return (0.6, 0, 0, 0.8)       
            if x > 50: return (1, 0, 0, 0.6)         
            if x > 30: return (1, 0.6, 0, 0.5)       
            if x > 15: return (1, 1, 0, 0.4)         
            return (0, 0.8, 0, 0.2)                  

        folium.raster_layers.ImageOverlay(
            image=st.session_state['ttci_data'],
            bounds=[[bounds.bottom, bounds.left], [bounds.top, bounds.right]],
            colormap=risk_colormap, name="TTCI Risk Layer", opacity=0.7
        ).add_to(m)
        
        colormap = cm.LinearColormap(
            colors=['green', 'yellow', 'orange', 'red', 'darkred'],
            vmin=0, vmax=100, caption='UAS CFIT Risk Score (0 = Safe, 100 = Fatal)'
        ).add_to(m)

        formatter = "function(num) {return L.Util.formatNum(num, 5);};"
        plugins.MousePosition(
            position='topright', separator=' | ', empty_string='Hover over map',
            lng_first=False, prefix='Coordinates:',
            lat_formatter=formatter, lng_formatter=formatter,
        ).add_to(m)

        # ---------------------------------------------------------
        # ADVANCED HUD INJECTION: Replaces Python nan with -9999 to prevent JS syntax errors
        # ---------------------------------------------------------
        tci_js = np.nan_to_num(st.session_state['ttci_data'], nan=-9999).tolist()
        dem_js = np.nan_to_num(st.session_state['dem_raw'], nan=-9999).tolist()
        slp_js = np.nan_to_num(st.session_state['slope_risk'], nan=-9999).tolist()
        tri_js = np.nan_to_num(st.session_state['ruggedness_risk'], nan=-9999).tolist()
        
        rows, cols = st.session_state['ttci_data'].shape
        
        custom_hud_js = f"""
        // Create the HUD Control Box
        var infoControl = L.control({{position: 'bottomleft'}});
        infoControl.onAdd = function (map) {{
            this._div = L.DomUtil.create('div', 'info-hover');
            this._div.innerHTML = '<div style="background:rgba(0,0,0,0.8); padding:15px; border-radius:8px; color:white; font-family:Arial; min-width:200px;"><b>Live Terrain Sensors</b><br><span style="color:#aaa; font-size:12px;">Hover over map to read data</span></div>';
            return this._div;
        }};
        
        // Link HUD to mouse movement
        function onMouseMove(e) {{
            var lat = e.latlng.lat;
            var lng = e.latlng.lng;
            var minLat = {bounds.bottom}; var maxLat = {bounds.top};
            var minLng = {bounds.left}; var maxLng = {bounds.right};
            
            if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {{
                var pctY = (maxLat - lat) / (maxLat - minLat);
                var pctX = (lng - minLng) / (maxLng - minLng);
                var row = Math.floor(pctY * {rows});
                var col = Math.floor(pctX * {cols});
                
                var tci_data = {tci_js};
                var dem_data = {dem_js};
                var slp_data = {slp_js};
                var tri_data = {tri_js};
                
                var tci = tci_data[row][col];
                var elv = dem_data[row][col];
                var slp = slp_data[row][col];
                var tri = tri_data[row][col];
                
                if(tci === -9999 || isNaN(tci)) {{
                     infoControl._div.innerHTML = '<div style="background:rgba(0,0,0,0.8); padding:15px; border-radius:8px; color:white; font-family:Arial; min-width:200px;"><b>Live Terrain Sensors</b><br><span style="color:#aaa; font-size:12px;">No Terrain Data Here</span></div>';
                }} else {{
                     var status = tci > 80 ? '<span style="color:#ff4b4b; font-weight:bold;">🔴 CRITICAL NO-FLY</span>' : 
                                  tci > 50 ? '<span style="color:#ffa500; font-weight:bold;">🟠 HIGH RISK</span>' : 
                                  tci > 15 ? '<span style="color:#ffff00; font-weight:bold;">🟡 CAUTION</span>' : 
                                  '<span style="color:#00ff00; font-weight:bold;">🟢 SAFE</span>';
                     
                     infoControl._div.innerHTML = '<div style="background:rgba(0,0,0,0.8); padding:15px; border-radius:8px; color:white; font-family:Arial; font-size:14px; min-width:220px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">' +
                     '<h4 style="margin:0 0 10px 0; color:#4CAF50; border-bottom:1px solid #444; padding-bottom:5px;">Terrain Telemetry</h4>' +
                     '<b>Elevation:</b> ' + (elv !== -9999 ? elv.toFixed(1) + ' m' : 'N/A') + '<br>' +
                     '<b>Slope Risk:</b> ' + (slp !== -9999 ? slp.toFixed(1) : 'N/A') + '<br>' +
                     '<b>Turbulence:</b> ' + (tri !== -9999 ? tri.toFixed(1) : 'N/A') + '<br>' +
                     '<hr style="border:0; border-top:1px solid #444; margin:8px 0;">' +
                     '<b>TTCI Score:</b> ' + tci.toFixed(1) + '/100<br>' +
                     '<b>Status:</b> ' + status +
                     '</div>';
                }}
            }}
        }}
        """
        
        # Inject Javascript Macro into Folium
        hud_macro = folium.MacroElement()
        hud_macro._template = branca.element.Template(f"""
            {{% macro script(this, kwargs) %}}
                {custom_hud_js}
                infoControl.addTo({{{{ this._parent.get_name() }}}});
                {{{{ this._parent.get_name() }}}}.on('mousemove', onMouseMove);
            {{% endmacro %}}
        """)
        m.add_child(hud_macro)

        folium.LayerControl().add_to(m)
        st_folium(m, width=700, height=500, use_container_width=True)
        
    else:
        st.info("Upload a DEM and run the calculation to generate the interactive Leaflet GIS map layer.")