/* ============================================================================
   SIMULATION DATA: tables the physics / host code and the renderer both read.
   Kept out of the renderer so the simulation can run without it (tools/sim).
   ========================================================================== */
// materials: physics (density, friction, restitution) and look (roughness, metalness, texture, tint) per type
const MATDEFS = {
  dev:      { name: 'Dev Grid', density: 1.0, fr: 0.8, re: 0.05, rough: 0.8, metal: 0, tex: 'dev', tint: '#d4d8de' },
  wood:     { name: 'Wood', density: 0.5, fr: 0.6, re: 0.15, rough: 0.72, metal: 0, tex: 'wood', tint: '#ffffff' },
  metal:    { name: 'Metal', density: 2.2, fr: 0.4, re: 0.1, rough: 0.34, metal: 1, tex: 'brushed', tint: '#c9ced6' },
  concrete: { name: 'Concrete', density: 2.0, fr: 0.9, re: 0.02, rough: 0.95, metal: 0, tex: 'concrete', tint: '#c2beb6' },
  glass:    { name: 'Glass', density: 1.5, fr: 0.3, re: 0.15, rough: 0.04, metal: 0, tex: null, tint: '#cdeeff', glass: true },
  rubber:   { name: 'Rubber', density: 1.0, fr: 1.3, re: 0.6, rough: 0.9, metal: 0, tex: 'noise', tint: '#2a2c31' },
  plastic:  { name: 'Plastic', density: 0.4, fr: 0.5, re: 0.3, rough: 0.4, metal: 0, tex: null, tint: '#e9e9ec' },
  fabric:   { name: 'Fabric', density: 0.35, fr: 0.9, re: 0.08, rough: 0.97, metal: 0, tex: 'noise', tint: '#7d6f8f' },
  neon:     { name: 'Neon', density: 0.6, fr: 0.5, re: 0.2, rough: 0.3, metal: 0, tex: null, tint: '#4dd0e1', emissive: true },
};
const MAT_KEYS = Object.keys(MATDEFS);
const PAINT_COLORS = ['#ffffff', '#d4d8de', '#7a808a', '#2a2c31', '#ff5a5f', '#ff9f43', '#fed330', '#26de81', '#20bf6b', '#2bcbba', '#45aaf2', '#4b7bec', '#a55eea', '#f368e0', '#b8835a', '#6d4c33'];

// graphics tiers: the renderer's settings per tier (the host also checks a player's tier and names it in chat)
const TIERS = {
  low:    { label: 'Low',    path: 'ps1',  shadows: false, ao: false, bloom: false, reflections: false, csm: false, shadowSize: 0,    maxPR: 1.0,  lights: 4,  aniso: 1 },
  medium: { label: 'Medium', path: 'pbr',  shadows: true,  ao: false, bloom: false, reflections: false, csm: false, shadowSize: 1024, maxPR: 1.25, lights: 6,  aniso: 4 },
  high:   { label: 'High',   path: 'pbr',  shadows: true,  ao: true,  bloom: true,  reflections: false, csm: true, cascades: 3, shadowSize: 1024, maxPR: 1.5, lights: 8, aniso: 8 },
  ultra:  { label: 'Ultra',  path: 'pbr',  shadows: true,  ao: true,  bloom: true,  reflections: true,  csm: true, cascades: 4, shadowSize: 2048, maxPR: 2.0, lights: 12, aniso: 16 },
};
const TIER_KEYS = ['low', 'medium', 'high', 'ultra'];

// collider + mesh points of a ramp: rises toward -Z
function wedgePoints(w, hgt, d) { const x = w / 2, y = hgt / 2, z = d / 2; return new Float32Array([-x, -y, z, x, -y, z, x, -y, -z, -x, -y, -z, -x, y, -z, x, y, -z]); }
