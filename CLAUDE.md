# Garden Room Configurator — Project Brief

## What this is
A customer-facing 3D configurator and pricing tool for a garden room manufacturer based in Northern Ireland. Customers use it to design a garden room and get an accurate price estimate. It runs entirely in the browser as a local HTML/JS/CSS project — no backend, no build step.

## How to run it
```bash
npx serve .
# or: npm start (if package.json is set up)
```
Open http://localhost:3000 in a browser.

## File structure
```
configurator/
├── index.html        — markup only, all logic is in separate JS files
├── css/
│   └── style.css     — all styles
├── js/
│   ├── state.js      — single source of truth for current configuration values
│   ├── pricing.js    — ALL pricing rules and calculators (edit prices here)
│   ├── scene.js      — Three.js 3D scene, building geometry, GLB model loading
│   ├── ui.js         — event handlers wiring UI to state + pricing
│   ├── leads.js      — lead capture modal; stores leadInfo, builds mailto enquiry
│   └── quote.js      — quote modal builder, reads from pricing.js functions
└── assets/           — textures (.jpg) and 3D models (.glb), sensibly named
```

## Pricing rules (from employer spec)
All prices in `pricing.js`. Key rules:
- **Foundation**: Concrete £1,800 / Block £550 / Ground Screws £120/screw — all include 12m² base area, extra area charged per m²
- **Doors**: Single French £850 / Double French £1,600 / Bi-Fold £3,500 / Sliding £2,800
  - Bi-fold carries +70% uplift on base price
  - PVC material carries +20% on final door price
- **Roof styles**: Flat included / Apex +£1,400 / Lean-To +£800
- **Roof finishes**: EPDM included / Grey Shingle +£400 / Red Shingle +£400 / Green Roof +£1,200 / Pebble +£350 / Cedar Shingle +£600
- **Cladding**: Timber included / Composite +£700 / Render +£500 / Cedar +£950
- **Reinforcement**: Floor £65/m² / Walls £75/m² (wall area = perimeter × height) / Ceiling £60/m²
- **Electrical**: CAT6 £250/point / Stove Flue £2,800 / Fire Boarding £140 / Log Fire £795 / Radiator £249
- **Lighting**: Internal spotlights £65/each / External downlights £129/each
- **Decking**: £95/m²
- **Roof lantern**: £2,200
- **Window style uplifts**: Long Panel +£200 / Narrow Vertical +£150 / Narrow Horizontal +£150 — NOTE: these are placeholder figures, not confirmed by employer yet
- **Payment terms**: 50% deposit / 40% at manufacture start / 10% on completion

## 3D models
All GLB files are in `assets/`. They are real-world scaled (1 unit = 1 metre) with origins at bottom-left corner.

| File | Natural width | Notes |
|------|--------------|-------|
| door_french.glb | 1.6m | Used for single (scaled to 0.9m) and double (scaled to 1.8m) |
| door_bifold.glb | 2.4m | Used for bi-fold |
| door_sliding.glb | 2.4m | Used for sliding/patio |
| win_tilt.glb | 0.9m × 1.2m | Tilt & Turn |
| win_long.glb | 0.971m × 2.1m | Long panel |
| win_vert.glb | 0.4m × 1.2m | Narrow vertical |
| win_horiz.glb | 1.2m × 0.4m | Narrow horizontal |

Models are loaded via `loadModel(filePath)` in scene.js using `GLTFLoader.load()` with local file paths. Caching is handled automatically.

## Known issues / things still to fix
- Window placement positions (left/right wall) need visual verification and likely need position tweaks
- Roof finish prices for window styles are placeholder figures — need confirmation from employer
- No lead capture / quote submission form yet
- Not mobile responsive

## Architecture decisions
- No framework, no build step — plain HTML/JS/CSS so non-developers can open and edit it easily
- Three.js r128 loaded from CDN (cdnjs.cloudflare.com)
- GLTFLoader loaded from CDN (cdn.jsdelivr.net)
- All state lives in `state.js` — UI writes to state, pricing and scene read from state
- `buildRoom()` in scene.js is called whenever any visual option changes
- `updatePriceDisplay()` in ui.js is called whenever any pricing option changes
- Quote modal is generated fresh each time it opens from current state

## Context
- Developer is a trainee (Development & Automation role) at a multi-brand garden/outdoor products company in Northern Ireland
- This is an internal project being built incrementally alongside other responsibilities
- Eventually intended to be embedded on a customer-facing website
- Pricing engine accuracy is the current top priority over 3D visual quality
